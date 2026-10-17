import hashlib
import hmac
import json

import httpx
from sqlmodel import select

from app.config import settings
from app.models import Complaint, Customer, Decision
from app.tools.fastn_gateway import FastnGateway
from app.tools.gateway import AuditedGateway, get_gateway, reply_token
from app.tools.local_gateway import LocalGateway


def rows(session, action):
    return session.exec(select(Decision).where(Decision.action == action)).all()


def mock_fastn(handler):
    return FastnGateway("https://fastn.test/api/v1/workflows/", "key123", transport=httpx.MockTransport(handler))


async def test_local_calls_are_audited(session, case):
    g = get_gateway()
    await g.notify_officer(case, "unauthorized_transaction", "critical", "sum", "Review", session=session)
    await g.create_ticket(case, "unauthorized_transaction", "sum", "critical", session=session)
    await g.send_approved_reply(case, "hello", session=session, actor="agent", action="auto_reply", model="m")

    notify = rows(session, "notify_officer")[0]
    assert notify.payload["risk_tier"] == "critical" and notify.evidence["result"]["sent_via"] == "mock"
    assert rows(session, "create_ticket")[0].evidence["result"]["ticket_id"] == f"MOCK-{case.complaint_id}"
    reply = rows(session, "auto_reply")[0]
    assert (reply.payload, reply.model, reply.actor) == ({"text": "hello"}, "m", "agent")
    assert "authorization_token" not in json.dumps(reply.payload)  # never written to the audit log


async def test_reply_goes_to_customer_email_with_valid_token(session, case):
    session.add(Customer(id="C9", name="N", email="n@example.com"))
    session.get(Complaint, case.complaint_id).customer_id = "C9"
    session.commit()
    seen = {}

    class Spy(LocalGateway):
        async def send_approved_reply(self, complaint_id, reply_text, authorization_token, recipient_email=None):
            seen.update(email=recipient_email, token=authorization_token, id=complaint_id)
            return await super().send_approved_reply(complaint_id, reply_text, authorization_token, recipient_email)

    await AuditedGateway(Spy(), LocalGateway()).send_approved_reply(case, "hi there", session=session)
    assert seen["email"] == "n@example.com" and seen["id"] == case.complaint_id
    assert seen["token"] == reply_token(case.complaint_id, "hi there")
    assert seen["token"] != reply_token(case.complaint_id, "hi there!")  # bound to the exact text


def test_token_is_hmac_of_id_and_text_hash(monkeypatch):
    monkeypatch.setattr(settings, "reply_auth_secret", "s3cret")
    digest = hashlib.sha256(b"txt").hexdigest()
    expected = hmac.new(b"s3cret", f"7:{digest}".encode(), hashlib.sha256).hexdigest()
    assert reply_token(7, "txt") == expected


async def test_fastn_http_contract():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((str(request.url), request.headers["authorization"], json.loads(request.content), request.headers["x-fastn-env"]))
        name = request.url.path.split("/")[-2]
        body = {
            "notify_officer": {"success": True, "sent_via": "slack", "message_id": "m1"},
            "create_ticket": {"success": True, "ticket_id": "T-1", "ticket_url": "https://t/1"},
            "send_approved_reply": {"success": True, "sent_at": "2026-01-01T00:00:00Z"},
        }[name]
        return httpx.Response(200, json=body)

    g = mock_fastn(handler)
    assert (await g.notify_officer(3, "cat", "critical", "s", "act")).message_id == "m1"
    assert (await g.create_ticket(3, "cat", "s", "critical")).ticket_url == "https://t/1"
    assert (await g.send_approved_reply(3, "txt", "tok", "a@b.c")).success is True
    assert [c[0] for c in calls] == [
        "https://fastn.test/api/v1/workflows/notify_officer/execute",
        "https://fastn.test/api/v1/workflows/create_ticket/execute",
        "https://fastn.test/api/v1/workflows/send_approved_reply/execute",
    ]
    assert calls[0][1] == "Bearer key123"
    assert calls[0][3] == "live"  # x-fastn-env
    assert calls[0][2] == {
        "input": {
            "complaint_id": "3", "category": "cat", "risk_tier": "critical", "summary": "s",
            "required_action": "act", "officer_email": None,
        }
    }
    assert calls[1][2]["input"]["dashboard_url"] is None
    assert calls[2][2]["input"] == {
        "complaint_id": "3", "reply_text": "txt", "authorization_token": "tok", "recipient_email": "a@b.c",
    }


async def test_fastn_api_key_header_auth():
    seen = {}

    def handler(request):
        seen.update(request.headers)
        return httpx.Response(200, json={"success": True})

    g = FastnGateway("https://f.test", "k", "api_key_header", transport=httpx.MockTransport(handler))
    await g.create_ticket(1, "c", "s", "low")
    assert seen["x-api-key"] == "k" and "authorization" not in seen


async def test_fastn_http_error_falls_back_and_is_recorded(session, case):
    audited = AuditedGateway(mock_fastn(lambda r: httpx.Response(500)), LocalGateway())
    result = await audited.notify_officer(case, "c", "critical", "s", "a", session=session)
    assert result.sent_via == "mock"
    ev = rows(session, "notify_officer")[0].evidence
    assert ev["fallback_used"] is True and "HTTPStatusError" in ev["error"] and ev["gateway"] == "FastnGateway"


async def test_fastn_reported_failure_falls_back(session, case):
    handler = lambda r: httpx.Response(200, json={"success": False, "error": "slack down"})
    audited = AuditedGateway(mock_fastn(handler), LocalGateway())
    await audited.create_ticket(case, "c", "s", "critical", session=session)
    ev = rows(session, "create_ticket")[0].evidence
    assert ev["fallback_used"] is True and "slack down" in ev["error"]


async def test_fastn_success_is_used_without_fallback(session, case):
    handler = lambda r: httpx.Response(200, json={"success": True, "sent_via": "slack", "message_id": "x"})
    await AuditedGateway(mock_fastn(handler), LocalGateway()).notify_officer(case, "c", "t", "s", "a", session=session)
    ev = rows(session, "notify_officer")[0].evidence
    assert ev["result"]["sent_via"] == "slack" and "fallback_used" not in ev


async def test_enabled_but_unconfigured_falls_back(session, case, monkeypatch):
    monkeypatch.setattr(settings, "fastn_enabled", True)
    monkeypatch.setattr(settings, "fastn_gateway_url", "")
    await get_gateway().notify_officer(case, "c", "critical", "s", "a", session=session)
    assert "FASTN_GATEWAY_URL" in rows(session, "notify_officer")[0].evidence["error"]


def test_pipeline_notifies_for_critical_and_unknown(client, monkeypatch, session):
    from app import llm
    from app.schemas import CategoryMatch, ClassificationResult, ReportResult

    state = {"cls": ClassificationResult()}

    async def structured(model, system, user, schema, **kw):
        if schema is ClassificationResult:
            return llm.LLMResult(state["cls"], "m")
        return llm.LLMResult(ReportResult(summary="s", category="c", recommended_next_step="n"), "m")

    monkeypatch.setattr(llm, "structured", structured)
    client.post("/api/complaints", json={"text": "gibberish"})  # unknown -> notify only
    state["cls"] = ClassificationResult(
        categories=[CategoryMatch(category_id="unauthorized_transaction", confidence=0.9, supporting_quote="q")]
    )
    client.post("/api/complaints", json={"text": "money gone"})  # critical -> notify + ticket
    notified = rows(session, "notify_officer")
    assert [n.payload["risk_tier"] for n in notified] == ["unknown", "critical"]
    assert notified[1].payload["category"] == "unauthorized_transaction"
    assert len(rows(session, "create_ticket")) == 1


async def test_officer_email_and_dashboard_link_are_forwarded(session, case, monkeypatch):
    monkeypatch.setattr(settings, "officer_email", "boss@bank.test")
    monkeypatch.setattr(settings, "dashboard_url", "https://dash.test/")
    seen = {}

    class Spy(LocalGateway):
        async def notify_officer(self, complaint_id, category, risk_tier, summary, required_action, officer_email=None):
            seen["email"] = officer_email
            return await super().notify_officer(
                complaint_id, category, risk_tier, summary, required_action, officer_email
            )

        async def create_ticket(self, complaint_id, category, summary, risk_tier, dashboard_url=None):
            seen["url"] = dashboard_url
            return await super().create_ticket(complaint_id, category, summary, risk_tier, dashboard_url)

    g = AuditedGateway(Spy(), LocalGateway())
    await g.notify_officer(case, "c", "critical", "s", "a", session=session)
    await g.create_ticket(case, "c", "s", "critical", session=session)
    assert seen == {"email": "boss@bank.test", "url": f"https://dash.test/cases/{case.id}"}


async def test_fastn_unwraps_data_and_uses_workflow_ids():
    seen = {}

    def handler(request):
        seen.update(url=str(request.url), headers=request.headers)
        return httpx.Response(200, json={"data": {"success": True, "ticket_id": "OMB-7", "ticket_url": "https://j/OMB-7"}})

    g = FastnGateway(
        "https://f.test/api/v1/workflows", "fsk_test_abc", workflow_ids={"create_ticket": "wf_123"},
        transport=httpx.MockTransport(handler),
    )  # fmt: skip
    result = await g.create_ticket(1, "c", "s", "critical")
    assert (result.success, result.ticket_id) == (True, "OMB-7")
    assert seen["url"] == "https://f.test/api/v1/workflows/wf_123/execute"
    assert seen["headers"]["x-fastn-test-mode"] == "true"


async def test_fastn_live_key_has_no_test_mode_header():
    seen = {}

    def handler(request):
        seen.update(request.headers)
        return httpx.Response(200, json={"data": {"success": True}})

    g = FastnGateway("https://f.test", "fsk_live_abc", transport=httpx.MockTransport(handler))
    await g.create_ticket(1, "c", "s", "low")
    assert "x-fastn-test-mode" not in seen


async def test_fastn_unexpected_body_falls_back(session, case):
    handler = lambda r: httpx.Response(202, json={"data": {"executionId": "e1", "status": "queued"}})
    await AuditedGateway(mock_fastn(handler), LocalGateway()).notify_officer(case, "c", "t", "s", "a", session=session)
    ev = rows(session, "notify_officer")[0].evidence
    assert ev["fallback_used"] is True and "unexpected body" in ev["error"]


def test_token_matches_fastn_workflow_golden_value(monkeypatch):
    # Same vector the JS in fastn/workflows/_crypto.js was checked against: both sides must agree.
    monkeypatch.setattr(settings, "reply_auth_secret", "test-secret-key")
    text = "Dear customer, we refunded ₹500 — sorry! ✓"
    assert reply_token(42, text) == "b211176c86d612fc0435d310ac8fff498fc1373032a8daf536bfb43b8a91a148"
