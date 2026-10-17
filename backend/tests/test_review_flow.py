"""Human review endpoints the dashboard uses: pending approvals, draft edits, resolve,
low-tier audit review, persisted eval results, and fastn dedupe keys."""

import json

import httpx
import pytest
from sqlmodel import select

from app import meta
from app.agents import moderate_agent
from app.audit import log_decision
from app.models import Account, Case, Complaint, Decision
from app.tools.fastn_gateway import FastnGateway
from tests.test_phase5 import FINAL, agent_case, money, script, set_text, turn  # noqa: F401  (money: fixture)


def acts(session, case_id):
    rows = session.exec(select(Decision).where(Decision.case_id == case_id).order_by(Decision.id))  # type: ignore[arg-type]
    return [d.action for d in rows]


def awaiting_human(session, case, tier="critical"):
    set_text(session, case, "x", tier=tier)
    case.status = "awaiting_human"
    session.add(case)
    session.commit()


@pytest.mark.usefixtures("money")
async def test_case_exposes_pending_approval_and_human_draft_wins(client, session, case, monkeypatch):
    agent_case(session, case)
    script(monkeypatch, [turn(calls=[("issue_refund", {"txn_id": "T0001", "amount": 30, "reason": "failed"})]), turn(FINAL)])
    await moderate_agent.run_agent(case.id, session)

    out = client.get(f"/api/cases/{case.id}").json()
    assert out["customer_id"] == "C1" and out["draft_reply"] == "We are on it."
    [pending] = out["pending_approvals"]
    assert (pending["action"], pending["params"], pending["reason"]) == ("issue_refund", {"txn_id": "T0001", "amount": 30}, "failed")

    r = client.patch(f"/api/cases/{case.id}/draft-reply", json={"text": "Refund on its way."})
    assert r.status_code == 200 and r.json()["draft_reply"] == "Refund on its way."

    r = client.post(f"/api/cases/{case.id}/decision", json={"action": "approve", "payload": {"approval_id": pending["approval_id"]}})
    assert r.json()["status"] == "resolved" and r.json()["pending_approvals"] == []
    sent = session.exec(select(Decision).where(Decision.case_id == case.id, Decision.action == "send_reply")).one()
    assert sent.payload == {"text": "Refund on its way."}  # the human's edit went out, not the agent's
    assert session.get(Account, "A1").balance == 130
    assert client.patch(f"/api/cases/{case.id}/draft-reply", json={"text": "late"}).status_code == 409


def test_resolve_sends_human_reply_and_closes(client, session, case):
    awaiting_human(session, case)
    url = f"/api/cases/{case.id}/decision"
    assert client.post(url, json={"action": "resolve"}).status_code == 422  # nothing to send yet

    r = client.post(url, json={"action": "resolve", "payload": {"reply": "We blocked the card."}})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    sent = session.exec(select(Decision).where(Decision.action == "send_reply")).one()
    assert (sent.actor, sent.payload) == ("human", {"text": "We blocked the card."})
    assert acts(session, case.id).index("resolve") < acts(session, case.id).index("send_reply")
    assert client.post(url, json={"action": "resolve", "payload": {"reply": "again"}}).status_code == 409


def test_resolve_refuses_unknown_and_low(client, session, case):
    for tier in ("unknown", "low"):
        awaiting_human(session, case, tier=tier)
        r = client.post(f"/api/cases/{case.id}/decision", json={"action": "resolve", "payload": {"reply": "hi"}})
        assert r.status_code == 409


def test_low_tier_review_fine_and_escalate(client, session, case):
    set_text(session, case, "what is the fee?", tier="low")
    case.status, case.categories = "auto_replied", ["app_or_login_issue"]
    session.add(case)
    session.commit()
    log_decision(session, case.id, "agent", "auto_reply", {"text": "The fee is 2."})
    url = f"/api/low-tier/audit-sample/{case.id}/review"

    [item] = client.get("/api/low-tier/audit-sample").json()
    assert (item["review_status"], item["reply"], item["category"]) == ("pending", "The fee is 2.", "app_or_login_issue")

    assert client.post(url, json={"action": "looks_fine"}).json()["review_status"] == "verified_fine"
    assert session.get(Case, case.id).status == "auto_replied"

    r = client.post(url, json={"action": "escalate"})
    assert r.json()["review_status"] == "escalated"  # the latest review wins
    session.refresh(case)
    assert (case.tier, case.status) == ("moderate", "awaiting_human")
    assert client.get("/api/low-tier/audit-sample").json()[0]["review_status"] == "escalated"


def test_review_requires_an_auto_reply(client, session, case):
    assert client.post(f"/api/low-tier/audit-sample/{case.id}/review", json={"action": "looks_fine"}).status_code == 409
    assert client.post("/api/low-tier/audit-sample/9999/review", json={"action": "looks_fine"}).status_code == 404


def test_metrics_include_last_eval_and_unknown_routing(client, session, case):
    assert client.get("/api/metrics").json()["last_eval"] is None
    complaint = session.get(Complaint, case.complaint_id)
    complaint.true_category = "none"
    case.tier, case.status = "unknown", "awaiting_human"
    session.add(complaint)
    session.add(case)
    session.commit()
    meta.set_json(session, "last_eval", {"at": "2026-10-17T05:00:00+00:00", "results": {"critical_recall": 1.0}})

    out = client.get("/api/metrics").json()
    assert out["unknown_routing_rate"] == 1.0
    assert out["last_eval"] == {"critical_recall": 1.0} and out["last_eval_at"].startswith("2026-10-17")


async def test_fastn_sends_instance_scoped_dedupe_key():
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"data": {"success": True}})

    g = FastnGateway(
        "https://fastn.test/api/v1/workflows", "k", transport=httpx.MockTransport(handler),
        dedupe_key=lambda cid: f"db1:{cid}",
    )  # fmt: skip
    await g.notify_officer(3, "c", "critical", "s", "a")
    await g.create_ticket(3, "c", "s", "critical")
    await g.send_approved_reply(3, "t", "tok")
    assert "idempotency_key" not in bodies[0]["input"]  # notify has no dedupe
    assert bodies[1]["input"]["idempotency_key"] == bodies[2]["input"]["idempotency_key"] == "db1:3"
