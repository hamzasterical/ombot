import json

import pytest
from sqlmodel import select

from app import approvals, llm
from app.agents import low_reply, moderate_agent
from app.audit import log_decision
from app.models import Account, Case, Complaint, Customer, Decision, Transaction


@pytest.fixture
def money(session):
    session.add(Customer(id="C1", name="T"))
    session.add(Account(id="A1", customer_id="C1", balance=100))
    session.add(Account(id="A2", customer_id="C1", balance=0))
    session.add(Transaction(id="T0001", sender_account="A1", receiver_account="A2", amount=50))
    session.commit()


def actions(session, case_id):
    return [d.action for d in session.exec(select(Decision).where(Decision.case_id == case_id).order_by(Decision.id))]


# ---- approvals: the hard rule -------------------------------------------------


def test_nothing_executes_without_stored_human_approval(session, case, money):
    req = approvals.request_approval(session, case.id, "issue_refund", {"txn_id": "T0001", "amount": 20})
    with pytest.raises(approvals.ApprovalError, match="no stored human approval"):
        approvals.execute_approved_action(session, req.id)
    assert session.get(Account, "A1").balance == 100  # untouched

    # an approval by the agent or for a different request does not count
    log_decision(session, case.id, "agent", "approve", {"approval_id": req.id})
    log_decision(session, case.id, "human", "approve", {"approval_id": req.id + 99})
    with pytest.raises(approvals.ApprovalError):
        approvals.execute_approved_action(session, req.id)
    assert session.get(Account, "A1").balance == 100


def test_approved_action_runs_once(session, case, money):
    req = approvals.request_approval(session, case.id, "issue_refund", {"txn_id": "T0001", "amount": 20})
    log_decision(session, case.id, "human", "approve", {"approval_id": req.id})
    assert approvals.execute_approved_action(session, req.id)["new_balance"] == 120
    with pytest.raises(approvals.ApprovalError, match="already executed"):
        approvals.execute_approved_action(session, req.id)
    assert session.get(Account, "A1").balance == 120


def test_freeze_and_param_validation(session, case, money):
    req = approvals.request_approval(session, case.id, "freeze_payment", {"account_id": "A1"})
    log_decision(session, case.id, "human", "approve", {"approval_id": req.id})
    approvals.execute_approved_action(session, req.id)
    assert session.get(Account, "A1").status == "frozen"

    with pytest.raises(approvals.ApprovalError):
        approvals.request_approval(session, case.id, "issue_refund", {"txn_id": "T0001", "amount": 51})
    with pytest.raises(approvals.ApprovalError):
        approvals.request_approval(session, case.id, "freeze_payment", {})
    with pytest.raises(approvals.ApprovalError):
        approvals.request_approval(session, case.id, "delete_everything", {})


# ---- Layer 3 -------------------------------------------------------------------


def set_text(session, case, text, tier="low"):
    session.get(Complaint, case.complaint_id).text = text
    case.tier = tier
    session.add(case)
    session.commit()


def fake_structured(parsed):
    async def _s(*a, **k):
        return llm.LLMResult(parsed, "cheap", {"prompt_tokens": 3, "completion_tokens": 2}, 1)

    return _s


async def test_low_reply_sends_and_logs(session, case, monkeypatch):
    set_text(session, case, "How do I reset my password?")
    monkeypatch.setattr(llm, "structured", fake_structured(low_reply.LowReply(reply="Use the reset link.")))
    await low_reply.run(session, case)
    assert case.status == "auto_replied"
    row = session.exec(select(Decision).where(Decision.action == "auto_reply")).one()
    assert row.payload["text"] == "Use the reset link." and row.model == "cheap"


@pytest.mark.parametrize("flag_in", ["text", "model"])
async def test_low_reply_escalates_instead_of_sending(session, case, monkeypatch, flag_in):
    if flag_in == "text":
        set_text(session, case, "The app froze and money was deducted")
        called = fake_structured(low_reply.LowReply(reply="x"))
    else:
        set_text(session, case, "Something odd happened")
        called = fake_structured(low_reply.LowReply(reply="x", needs_escalation=True, escalation_reason="r"))
    monkeypatch.setattr(llm, "structured", called)
    await low_reply.run(session, case)
    assert (case.status, case.tier, case.assigned_layer) == ("awaiting_human", "moderate", 2)
    assert "auto_reply" not in actions(session, case.id)
    assert "escalate" in actions(session, case.id)


async def test_low_reply_llm_failure_goes_to_human(session, case, monkeypatch):
    set_text(session, case, "hello")
    monkeypatch.setattr(llm, "structured", fake_structured(None))
    await low_reply.run(session, case)
    assert case.status == "awaiting_human" and "auto_reply" not in actions(session, case.id)


# ---- Layer 2 -------------------------------------------------------------------


def turn(content=None, calls=()):
    tcs = [llm.ToolCall(f"id{i}", n, a) for i, (n, a) in enumerate(calls)]
    return llm.ChatTurn(content, tcs, {"prompt_tokens": 4, "completion_tokens": 1}, {"role": "assistant", "content": content})


def script(monkeypatch, turns):
    it = iter(turns)

    async def fake(model, messages, tools):
        return next(it)

    monkeypatch.setattr(llm, "chat_with_tools", fake)


def agent_case(session, case, text="payment failed but money deducted"):
    set_text(session, case, text, tier="moderate")
    session.get(Complaint, case.complaint_id).customer_id = "C1"
    case.status = "agent_running"
    session.add(case)
    session.commit()


FINAL = json.dumps({"resolution": "found it", "draft_reply": "We are on it."})


async def test_agent_read_only_resolves_and_replies(session, case, money, monkeypatch):
    agent_case(session, case)
    script(monkeypatch, [turn(calls=[("get_transaction", {"txn_id": "T0001"})]), turn(FINAL)])
    await moderate_agent.run_agent(case.id, session)
    assert case.status == "resolved"
    acts = actions(session, case.id)
    assert acts.count("tool_call") == 1 and "send_reply" in acts
    assert case.report["agent_resolution"]["resolution"] == "found it"


async def test_agent_money_move_only_proposes(session, case, money, monkeypatch):
    agent_case(session, case)
    script(
        monkeypatch,
        [
            turn(calls=[("issue_refund", {"txn_id": "T0001", "amount": 30, "reason": "failed"}),
                        ("freeze_payment", {"account_id": "A2", "reason": "hold"})]),
            turn(FINAL),
        ],
    )
    await moderate_agent.run_agent(case.id, session)
    assert case.status == "awaiting_approval"
    assert "send_reply" not in actions(session, case.id)  # nothing sent yet
    assert session.get(Account, "A1").balance == 100 and session.get(Account, "A2").status == "active"
    assert len(approvals.pending_requests(session, case.id)) == 2


async def test_agent_bad_tool_args_return_error_not_crash(session, case, money, monkeypatch):
    agent_case(session, case)
    script(
        monkeypatch,
        [turn(calls=[("issue_refund", {"txn_id": "T0001", "amount": 9999, "reason": "x"}), ("nope", {})]), turn(FINAL)],
    )
    await moderate_agent.run_agent(case.id, session)
    assert case.status == "resolved" and approvals.pending_requests(session, case.id) == []


async def test_agent_step_limit_and_garbage_go_to_human(session, case, money, monkeypatch):
    agent_case(session, case)
    script(monkeypatch, [turn("not json")] * 20)
    await moderate_agent.run_agent(case.id, session)
    assert case.status == "awaiting_human" and "agent_failed" in actions(session, case.id)


async def test_agent_api_error_goes_to_human(session, case, money, monkeypatch):
    agent_case(session, case)

    async def boom(*a):
        raise RuntimeError("down")

    monkeypatch.setattr(llm, "chat_with_tools", boom)
    await moderate_agent.run_agent(case.id, session)
    assert case.status == "awaiting_human"


async def test_agent_ignores_cases_not_in_running_state(session, case, money, monkeypatch):
    agent_case(session, case)
    case.status = "awaiting_human"
    session.commit()
    script(monkeypatch, [])
    await moderate_agent.run_agent(case.id, session)
    assert case.status == "awaiting_human" and actions(session, case.id) == []


# ---- full flow through the API -------------------------------------------------


async def test_approve_flow_via_api(client, session, case, money, monkeypatch):
    agent_case(session, case)
    script(
        monkeypatch,
        [turn(calls=[("issue_refund", {"txn_id": "T0001", "amount": 30, "reason": "failed"})]), turn(FINAL)],
    )
    await moderate_agent.run_agent(case.id, session)
    url = f"/api/cases/{case.id}/decision"

    assert client.post(url, json={"action": "approve", "payload": {"approval_id": 9999}}).status_code == 409
    r = client.post(url, json={"action": "approve"})  # single pending: id inferred
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    assert session.get(Account, "A1").balance == 130
    acts = actions(session, case.id)
    assert acts.index("approve") < acts.index("action_executed") < acts.index("send_reply")
    assert client.post(url, json={"action": "approve"}).status_code == 409  # nothing pending now


async def test_reject_flow_hands_back_to_human(client, session, case, money, monkeypatch):
    agent_case(session, case)
    script(
        monkeypatch,
        [turn(calls=[("freeze_payment", {"account_id": "A1", "reason": "r"})]), turn(FINAL)],
    )
    await moderate_agent.run_agent(case.id, session)
    r = client.post(f"/api/cases/{case.id}/decision", json={"action": "reject"})
    assert r.json()["status"] == "awaiting_human"
    assert session.get(Account, "A1").status == "active"
    assert "action_executed" not in actions(session, case.id)


def test_audit_sample_endpoint(client, session, case):
    log_decision(session, case.id, "agent", "auto_reply", {"text": "hi"})
    sample = client.get("/api/low-tier/audit-sample").json()
    assert sample[0]["reply"] == "hi" and sample[0]["case_id"] == case.id
    assert isinstance(session.get(Case, case.id), Case)
