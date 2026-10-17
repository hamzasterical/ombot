import asyncio
import json

import pytest
from sqlmodel import select

from app import llm
from app.agents import moderate_agent, review_gate
from app.models import Account, Case, Complaint, Customer, Decision, Transaction

FINAL = json.dumps({"resolution": "found it", "draft_reply": "We are on it."})


@pytest.fixture
def money(session):
    session.add(Customer(id="C1", name="T"))
    session.add(Account(id="A1", customer_id="C1", balance=100))
    session.add(Account(id="A2", customer_id="C1", balance=0))
    session.add(Transaction(id="T0001", sender_account="A1", receiver_account="A2", amount=50))
    session.commit()


@pytest.fixture(autouse=True)
def _clean_gates():
    yield
    review_gate._gates.clear()


def turn(content=None, calls=()):
    tcs = [llm.ToolCall(f"id{i}", n, a) for i, (n, a) in enumerate(calls)]
    return llm.ChatTurn(content, tcs, {"prompt_tokens": 4, "completion_tokens": 1}, {"role": "assistant", "content": content})


def script(monkeypatch, turns):
    it = iter(turns)
    seen = []

    async def fake(model, messages, tools):
        seen.append(messages)
        return next(it)

    monkeypatch.setattr(llm, "chat_with_tools", fake)
    return seen


def agent_case(session, case):
    session.get(Complaint, case.complaint_id).customer_id = "C1"
    case.tier = "moderate"
    case.status = "agent_running"
    session.add(case)
    session.commit()


async def until_pending(case_id, call_no):
    for _ in range(200):
        p = review_gate.pending(case_id)
        if p and p["call_no"] == call_no:
            return p
        await asyncio.sleep(0.01)
    raise AssertionError("agent never asked for a review")


def tool_calls(session, case_id):
    rows = session.exec(select(Decision).where(Decision.case_id == case_id, Decision.action == "tool_call"))
    return [(d.payload["name"], d.payload["args"], d.evidence["result"]) for d in rows]


async def test_reject_is_not_executed_and_note_reaches_the_model(session, case, money, monkeypatch):
    agent_case(session, case)
    seen = script(
        monkeypatch,
        [turn(calls=[("get_transaction", {"txn_id": "T0001"})]), turn(FINAL)],
    )
    review_gate.open_gate(case.id, "all")
    task = asyncio.create_task(moderate_agent.run_agent(case.id, session))
    await until_pending(case.id, 1)
    review_gate.submit(case.id, 1, review_gate.Review("reject", "check the receiver first"), None)
    await task

    [(name, _, result)] = tool_calls(session, case.id)
    assert name == "get_transaction" and result["status"] == "rejected_by_reviewer"
    tool_msg = json.loads(next(m["content"] for m in seen[-1] if m["role"] == "tool"))
    assert tool_msg["reviewer_note"] == "check the receiver first"
    assert review_gate.mode(case.id) is None  # gate closed when the run ends


async def test_approve_with_edited_args_runs_the_edit(session, case, money, monkeypatch):
    agent_case(session, case)
    script(monkeypatch, [turn(calls=[("get_transaction", {"txn_id": "WRONG"})]), turn(FINAL)])
    review_gate.open_gate(case.id, "all")
    task = asyncio.create_task(moderate_agent.run_agent(case.id, session))
    await until_pending(case.id, 1)
    review_gate.submit(case.id, 1, review_gate.Review("approve", args={"txn_id": "T0001"}), None)
    await task

    [(_, args, result)] = tool_calls(session, case.id)
    assert args == {"txn_id": "T0001"} and "error" not in result
    assert case.status == "resolved"


async def test_abort_hands_the_case_back_to_a_human(session, case, money, monkeypatch):
    agent_case(session, case)
    script(monkeypatch, [turn(calls=[("get_transaction", {"txn_id": "T0001"})]), turn(FINAL)])
    review_gate.open_gate(case.id, "all")
    task = asyncio.create_task(moderate_agent.run_agent(case.id, session))
    await until_pending(case.id, 1)
    review_gate.submit(case.id, 1, review_gate.Review("abort"), None)
    await task

    assert case.status == "awaiting_human" and tool_calls(session, case.id) == []


async def test_risky_mode_only_pauses_on_writes_and_auto_releases_the_wait(session, case, money, monkeypatch):
    agent_case(session, case)
    script(
        monkeypatch,
        [
            turn(calls=[("get_transaction", {"txn_id": "T0001"}), ("draft_reply", {"text": "hi"})]),
            turn(FINAL),
        ],
    )
    review_gate.open_gate(case.id, "risky")
    task = asyncio.create_task(moderate_agent.run_agent(case.id, session))
    p = await until_pending(case.id, 2)  # the read at call 1 ran without a pause
    assert p["tool"] == "draft_reply"
    review_gate.submit(case.id, None, None, "auto")  # "let it finish" releases the pending write
    await task
    assert [t[0] for t in tool_calls(session, case.id)] == ["get_transaction", "draft_reply"]


def test_submit_rejects_a_stale_call_number():
    review_gate.open_gate(7, "all")
    with pytest.raises(review_gate.ReviewError):
        review_gate.submit(7, 1, review_gate.Review("approve"), None)  # nothing pending
    with pytest.raises(review_gate.ReviewError):
        review_gate.submit(99, 1, review_gate.Review("approve"), None)  # no run for this case
