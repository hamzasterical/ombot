import base64

import pytest

from app import inbound_email
from app.config import settings
from app.meta import get_json
from app.models import Case, Complaint, Customer
from app.tools.gateway import AuditedGateway
from app.tools.local_gateway import LocalGateway


def b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def email(**overrides) -> dict:
    return {
        "gmail_id": "g1",
        "thread_id": "t1",
        "received_at": "2026-10-17T05:32:00.000Z",
        "from": "Hamza Ali <Hamxa@Example.org>",
        "subject": "Transaction issue",
        "message_id": "<abc@mail.gmail.com>",
        "label_ids": ["INBOX", "UNREAD"],
        "auto_submitted": None,
        "precedence": None,
        "list_header": False,
        "text_b64": b64("I sent PKR 25,000 to the wrong account.\r\n\r\nOn Fri, Oct 16, Bank <x@y> wrote:\r\n> old"),
        "html_b64": None,
        **overrides,
    }


@pytest.fixture
def fake_pipeline(monkeypatch):
    """Records the call and creates the complaint + case, without LLM calls."""
    calls = []

    async def process(session, text, customer_id, on_complaint=None):
        complaint = Complaint(text=text, customer_id=customer_id)
        session.add(complaint)
        session.commit()
        session.refresh(complaint)
        on_complaint(session, complaint.id)
        case = Case(complaint_id=complaint.id, tier="moderate", status="awaiting_human")
        session.add(case)
        session.commit()
        session.refresh(case)
        calls.append({"text": text, "customer_id": customer_id})
        return case

    monkeypatch.setattr(inbound_email, "process_complaint", process)
    return calls


def test_clean_body_drops_quoted_history():
    assert inbound_email.clean_body(email()["text_b64"], None) == "I sent PKR 25,000 to the wrong account."
    assert inbound_email.clean_body(None, b64("<p>Card <b>blocked</b></p><br>help")) == "Card blocked\n\nhelp"


@pytest.mark.parametrize(
    "overrides,reason",
    [
        ({"from": "Bank <bank@example.com>"}, "own address"),
        ({"from": "no-reply@service.com"}, "automated"),
        ({"auto_submitted": "auto-replied"}, "auto-responder"),
        ({"precedence": "bulk"}, "bulk"),
        ({"list_header": True}, "mailing list"),
        ({"label_ids": ["SPAM"]}, "spam"),
    ],
)
async def test_automated_and_own_mail_is_skipped(session, fake_pipeline, monkeypatch, overrides, reason):
    monkeypatch.setattr(settings, "bank_inbox_email", "bank@example.com")
    result = await inbound_email.ingest(session, email(**overrides))
    assert result["status"] == "skipped" and reason in result["reason"]
    assert fake_pipeline == []


async def test_email_becomes_a_complaint_once(session, fake_pipeline):
    first = await inbound_email.ingest(session, email())
    again = await inbound_email.ingest(session, email())

    assert first["status"] == "ingested" and again["status"] == "already ingested"
    assert len(fake_pipeline) == 1
    assert fake_pipeline[0]["text"] == "Transaction issue\n\nI sent PKR 25,000 to the wrong account."
    customer = session.get(Customer, fake_pipeline[0]["customer_id"])
    assert customer.email == "hamxa@example.org" and customer.name == "Hamza Ali"
    case = session.get(Case, first["case_id"])
    assert get_json(session, f"email_thread:{case.complaint_id}")["thread_id"] == "t1"


async def test_known_sender_is_matched_to_existing_customer(session, fake_pipeline):
    session.add(Customer(id="CUST-1", name="H", email="hamxa@example.org"))
    session.commit()
    await inbound_email.ingest(session, email())
    assert fake_pipeline[0]["customer_id"] == "CUST-1"


async def test_reply_to_email_case_goes_to_sender_in_thread(session, fake_pipeline):
    result = await inbound_email.ingest(session, email())
    case = session.get(Case, result["case_id"])
    seen = {}

    class Spy(LocalGateway):
        async def send_approved_reply(self, complaint_id, reply_text, authorization_token, recipient_email=None,
                                      reply_to_sender=False, thread=None):  # fmt: skip
            seen.update(email=recipient_email, to_sender=reply_to_sender, thread=thread)
            return await super().send_approved_reply(complaint_id, reply_text, authorization_token, recipient_email)

    await AuditedGateway(Spy(), LocalGateway()).send_approved_reply(case, "We are on it.", session=session)
    assert seen["email"] == "hamxa@example.org" and seen["to_sender"] is True
    assert seen["thread"]["message_id"] == "<abc@mail.gmail.com>" and seen["thread"]["subject"] == "Transaction issue"


def test_changing_inbound_email_since_restarts_the_cursor(session, monkeypatch):
    monkeypatch.setattr(settings, "inbound_email_since", "")
    first = inbound_email._cursor(session)
    assert inbound_email._cursor(session) == first  # stable while the setting is unchanged

    monkeypatch.setattr(settings, "inbound_email_since", "2026-01-01T00:00:00Z")
    earlier = inbound_email._cursor(session)
    assert earlier < first and inbound_email._cursor(session) == earlier
