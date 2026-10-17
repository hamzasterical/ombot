"""Email intake: customer emails in the bank's Gmail inbox become complaints.

The backend polls the fastn fetch_inbound_emails workflow (pull, so it works without a public URL).
Each new email is matched to a customer by sender address (a customer is created for an unknown
sender), run through the normal pipeline, and its Gmail thread is remembered so the reply goes back
to the sender in the same thread (see AuditedGateway.send_approved_reply).

Safety, because the inbox is a real mailbox:
- only mail received after the cursor is read (INBOUND_EMAIL_SINCE, else the first poll), never a backlog
- mail from the bank's own address, no-reply/daemon senders, bulk/list mail and auto-responders is skipped,
  so newsletters are not answered and two auto-responders cannot reply to each other forever
- each Gmail message is marked seen before it is processed: a crash can drop an email, never answer it twice
"""

import asyncio
import base64
import hashlib
import html
import logging
import re
from datetime import UTC, datetime
from email.utils import parseaddr

from sqlmodel import Session, func, select

from app.config import settings
from app.db import engine
from app.meta import get_json, set_json
from app.models import Customer
from app.pipeline import process_complaint
from app.tools.gateway import get_fastn

log = logging.getLogger(__name__)

CURSOR_KEY = "inbound_email_cursor"  # epoch seconds; Gmail "after:" takes epoch seconds
SINCE_KEY = "inbound_email_since"  # the INBOUND_EMAIL_SINCE value the cursor was started from
MAX_BODY_CHARS = 4000
SKIP_SENDER = re.compile(r"(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?@|bounce)", re.IGNORECASE)
SKIP_LABELS = {"SPAM", "TRASH", "SENT", "DRAFT"}
# Start of the quoted previous message in a reply ("On Fri, ... wrote:" or Outlook's separator)
QUOTE_START = re.compile(r"^(On .{0,200}wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+)$", re.MULTILINE | re.IGNORECASE)


def _b64(data: str | None) -> str:
    if not data:
        return ""
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", errors="replace")


def _html_to_text(markup: str) -> str:
    markup = re.sub(r"(?is)<(script|style).*?</\1>", "", markup)
    markup = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr)>", "\n", markup)
    return html.unescape(re.sub(r"<[^>]+>", "", markup))


def clean_body(text_b64: str | None, html_b64: str | None) -> str:
    """Plain text of the new message only: quoted history and signatures' noise trimmed."""
    text = _b64(text_b64) or _html_to_text(_b64(html_b64))
    text = text.replace("\r\n", "\n")
    if m := QUOTE_START.search(text):
        text = text[: m.start()]
    lines = [ln for ln in text.split("\n") if not ln.lstrip().startswith(">")]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return text[:MAX_BODY_CHARS]


def skip_reason(msg: dict, sender: str) -> str | None:
    if not sender or "@" not in sender:
        return "no sender address"
    if settings.bank_inbox_email and sender == settings.bank_inbox_email.lower():
        return "sent by the bank's own address"
    if SKIP_SENDER.search(sender):
        return "automated sender"
    if (msg.get("auto_submitted") or "no").lower() != "no":
        return "auto-submitted (auto-responder)"
    if (msg.get("precedence") or "").lower() in ("bulk", "junk", "list", "auto_reply"):
        return "bulk mail"
    if msg.get("list_header"):
        return "mailing list"
    if SKIP_LABELS & set(msg.get("label_ids") or []):
        return "spam, sent or draft"
    return None


def customer_for(session: Session, email: str, name: str) -> Customer:
    """The customer with this email, or a new one so the reply has an address to go to."""
    found = session.exec(select(Customer).where(func.lower(Customer.email) == email)).first()
    if found:
        return found
    customer = Customer(
        id=f"EMAIL-{hashlib.sha1(email.encode()).hexdigest()[:8].upper()}",
        name=name or email.split("@")[0],
        email=email,
    )
    session.add(customer)
    session.commit()
    return customer


def _cursor(session: Session) -> int:
    since = settings.inbound_email_since.strip()
    stored = get_json(session, CURSOR_KEY)
    # A new INBOUND_EMAIL_SINCE value restarts the cursor once (per-message dedupe prevents double answers)
    if stored is not None and get_json(session, SINCE_KEY) == since:
        return int(stored)
    start = datetime.fromisoformat(since) if since else datetime.now(UTC)
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    value = int(start.timestamp()) if since or stored is None else int(stored)
    set_json(session, CURSOR_KEY, value)
    set_json(session, SINCE_KEY, since)
    return value


async def ingest(session: Session, msg: dict) -> dict:
    """One fetched message -> a case (or a recorded skip). Idempotent per Gmail message id."""
    seen_key = f"inbound_email:{msg['gmail_id']}"
    if get_json(session, seen_key) is not None:
        return {"gmail_id": msg["gmail_id"], "status": "already ingested"}

    name, address = parseaddr(msg.get("from") or "")
    sender = address.strip().lower()
    subject = (msg.get("subject") or "").strip()
    if reason := skip_reason(msg, sender):
        set_json(session, seen_key, {"skipped": reason})
        log.info("inbound email %s from %s skipped: %s", msg["gmail_id"], sender or "?", reason)
        return {"gmail_id": msg["gmail_id"], "status": "skipped", "reason": reason}

    body = clean_body(msg.get("text_b64"), msg.get("html_b64"))
    text = "\n\n".join(p for p in (subject, body) if p) or "(empty email)"
    customer = customer_for(session, sender, name.strip())
    set_json(session, seen_key, {"processing": True})  # before processing: never answer twice

    case = await process_complaint(session, text, customer.id, on_complaint=_remember_thread(msg, sender, subject))
    set_json(session, seen_key, {"case_id": case.id, "complaint_id": case.complaint_id})
    log.info("inbound email %s from %s -> case %s (%s)", msg["gmail_id"], sender, case.id, case.tier)
    return {"gmail_id": msg["gmail_id"], "status": "ingested", "case_id": case.id, "tier": case.tier}


def _remember_thread(msg: dict, sender: str, subject: str):
    """Stored right after the complaint row, because a low-tier case is answered inside process_complaint."""

    def store(session: Session, complaint_id: int) -> None:
        set_json(
            session,
            f"email_thread:{complaint_id}",
            {
                "from_email": sender,
                "thread_id": msg.get("thread_id"),
                "message_id": msg.get("message_id"),
                "subject": subject or None,
                "gmail_id": msg["gmail_id"],
            },
        )

    return store


async def poll_once() -> dict:
    fastn = get_fastn()
    if fastn is None:
        raise RuntimeError("email intake needs FASTN_ENABLED=true")
    with Session(engine) as session:
        after = _cursor(session)
        messages = await fastn.fetch_inbound_emails(f"{settings.inbound_gmail_query} after:{after}")
        results = []
        newest = after
        for msg in sorted(messages, key=lambda m: m.get("received_at") or ""):
            try:
                results.append(await ingest(session, msg))
            except Exception as e:
                session.rollback()
                log.exception("inbound email %s failed", msg.get("gmail_id"))
                results.append({"gmail_id": msg.get("gmail_id"), "status": "failed", "error": str(e)})
            if received := msg.get("received_at"):
                newest = max(newest, int(datetime.fromisoformat(received).timestamp()))
        # Gmail's "after:" is second-granular; step back one so a same-second email is not missed (dedupe covers it)
        set_json(session, CURSOR_KEY, max(after, newest - 1))
    return {"after": after, "fetched": len(messages), "results": results}


async def poll_forever() -> None:
    log.info("email intake on: polling every %ss", settings.inbound_poll_seconds)
    while True:
        try:
            summary = await poll_once()
            if summary["fetched"]:
                log.info("email intake: %s", summary)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("email intake poll failed")
        await asyncio.sleep(settings.inbound_poll_seconds)
