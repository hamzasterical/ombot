"""Read-only data tools over the synthetic DB and policy files.

Plain functions returning JSON-serializable dicts. Used by the report generator, the Layer 2
agent, and (Phase 6) exposed as MCP tools.
"""

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlmodel import Session, select

from app.models import Account, Card, Complaint, Customer, Merchant, SecurityEvent, Transaction

POLICY_DIR = Path(__file__).resolve().parents[1] / "mcp_server" / "policies"
NOT_FOUND = {"error": "not found"}


def _txn(t: Transaction) -> dict:
    return {
        "id": t.id,
        "sender_account": t.sender_account,
        "receiver_account": t.receiver_account,
        "amount": t.amount,
        "merchant_id": t.merchant_id,
        "channel": t.channel,
        "device_id": t.device_id,
        "created_at": t.created_at.isoformat(),
        "status": t.status,
        "description": t.description,
        "location": t.location,
        "failure_reason": t.failure_reason,
    }


def _event(e: SecurityEvent) -> dict:
    return {
        "event_type": e.event_type,
        "device_id": e.device_id,
        "location": e.location,
        "detail": e.detail,
        "created_at": e.created_at.isoformat(),
    }


def _account_with_customer(session: Session, account_id: str) -> dict:
    account = session.get(Account, account_id)
    if account is None:
        return NOT_FOUND
    customer = session.get(Customer, account.customer_id)
    return {
        "account": {"id": account.id, "type": account.type, "balance": account.balance, "status": account.status},
        "customer": {"id": customer.id, "name": customer.name, "phone": customer.phone, "city": customer.city}
        if customer
        else None,
    }


def get_transaction(session: Session, txn_id: str) -> dict:
    t = session.get(Transaction, txn_id)
    return _txn(t) if t else NOT_FOUND


def get_sender(session: Session, account_id: str) -> dict:
    return _account_with_customer(session, account_id)


def get_receiver(session: Session, account_id: str) -> dict:
    return _account_with_customer(session, account_id)


def get_customer_history(session: Session, customer_id: str, days: int = 90) -> dict:
    customer = session.get(Customer, customer_id)
    if customer is None:
        return NOT_FOUND
    accounts = session.exec(select(Account).where(Account.customer_id == customer_id)).all()
    ids = [a.id for a in accounts]
    cutoff = datetime.now(UTC) - timedelta(days=days)
    in_window = Transaction.created_at >= cutoff  # type: ignore[operator]
    newest = Transaction.created_at.desc()  # type: ignore[attr-defined]
    sent = session.exec(
        select(Transaction).where(Transaction.sender_account.in_(ids), in_window).order_by(newest)  # type: ignore[attr-defined]
    ).all()
    received = session.exec(
        select(Transaction)
        .where(Transaction.receiver_account.in_(ids), Transaction.sender_account.not_in(ids), in_window)  # type: ignore[attr-defined]
        .order_by(newest)
    ).all()
    cards = session.exec(select(Card).where(Card.account_id.in_(ids))).all()  # type: ignore[attr-defined]
    complaints = session.exec(select(Complaint).where(Complaint.customer_id == customer_id)).all()
    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "city": customer.city,
            "primary_device_id": customer.primary_device_id,
            "segment": customer.segment,
        },
        "accounts": [{"id": a.id, "type": a.type, "balance": a.balance, "status": a.status} for a in accounts],
        "cards": [{"id": c.id, "kind": c.kind, "last4": c.last4, "status": c.status, "account_id": c.account_id} for c in cards],
        "transactions": [_txn(t) for t in sent],
        "received_transactions": [_txn(t) for t in received[:10]],
        "security_events": get_security_events(session, customer_id, days=30)["events"],
        "complaint_count": len(complaints),
    }


def get_security_events(session: Session, customer_id: str, days: int = 30) -> dict:
    """Logins, device and credential changes, newest first."""
    if session.get(Customer, customer_id) is None:
        return NOT_FOUND
    cutoff = datetime.now(UTC) - timedelta(days=days)
    events = session.exec(
        select(SecurityEvent)
        .where(SecurityEvent.customer_id == customer_id, SecurityEvent.created_at >= cutoff)  # type: ignore[operator]
        .order_by(SecurityEvent.created_at.desc())  # type: ignore[attr-defined]
    ).all()
    return {"customer_id": customer_id, "events": [_event(e) for e in events]}


def check_merchant(session: Session, merchant_id: str) -> dict:
    m = session.get(Merchant, merchant_id)
    if m is None:
        return NOT_FOUND
    return {
        "id": m.id,
        "name": m.name,
        "category": m.category,
        "city": m.city,
        "country": m.country,
        "complaint_count": m.complaint_count,
    }


def get_policy(policy_id: str) -> str | None:
    path = POLICY_DIR / f"{Path(policy_id).name}.md"  # .name blocks path traversal
    return path.read_text(encoding="utf-8") if path.is_file() else None


def search_policy(query: str, limit: int = 3) -> list[dict]:
    """Keyword search across policy files; ranks by number of matching query words."""
    words = set(re.findall(r"[a-z]{3,}", query.lower()))
    scored = []
    for path in sorted(POLICY_DIR.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        score = sum(content.lower().count(w) for w in words)
        if score:
            scored.append((score, {"policy_id": path.stem, "content": content}))
    scored.sort(key=lambda x: -x[0])
    return [item for _, item in scored[:limit]]
