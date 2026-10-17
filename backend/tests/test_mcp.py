import json

import pytest
from mcp.server.mcpserver.exceptions import ResourceError, ToolError
from sqlmodel import select

from app.mcp_server import server
from app.models import Account, Case, Category, Customer, Decision, Transaction


@pytest.fixture(autouse=True)
def mcp_db(session, monkeypatch):
    """Point the server's per-call sessions at the in-memory test DB."""
    monkeypatch.setattr(server, "engine", session.get_bind())
    session.add(Customer(id="C1", name="T"))
    session.add(Account(id="A1", customer_id="C1", balance=100))
    session.add(Transaction(id="T0001", sender_account="A1", amount=50))
    session.commit()


def text(result) -> str:
    return result.content[0].text


async def test_registry_and_policy_resources(session):
    session.add(Category(id="new_one", name="New", tier="low", source="human_added"))
    session.commit()
    contents = list(await server.mcp.read_resource("categories://registry"))
    ids = {c["id"] for c in json.loads(contents[0].content)}
    assert "new_one" in ids  # human-added categories show up immediately

    doc = list(await server.mcp.read_resource("policies://policy_unauthorized_txn"))
    assert "Sample bank policy" in doc[0].content
    with pytest.raises(ResourceError):
        await server.mcp.read_resource("policies://nope")


async def test_tool_list_and_read_tool():
    names = {t.name for t in await server.mcp.list_tools()}
    assert {"get_transaction", "search_policy", "draft_reply", "send_reply", "freeze_payment", "issue_refund"} <= names
    result = await server.mcp.call_tool("get_transaction", {"txn_id": "T0001"})
    assert json.loads(text(result))["amount"] == 50


async def test_money_tools_only_propose(session, case):
    r = await server.mcp.call_tool(
        "issue_refund", {"case_id": case.id, "txn_id": "T0001", "amount": 10, "reason": "x"}
    )
    assert json.loads(text(r))["status"] == "pending_human_approval"
    r = await server.mcp.call_tool("freeze_payment", {"case_id": case.id, "account_id": "A1", "reason": "x"})
    assert json.loads(text(r))["status"] == "pending_human_approval"
    session.expire_all()
    assert session.get(Account, "A1").balance == 100 and session.get(Account, "A1").status == "active"
    assert session.get(Case, case.id).status == "awaiting_approval"
    assert len(session.exec(select(Decision).where(Decision.action == "approval_requested")).all()) == 2
    with pytest.raises(ToolError):
        await server.mcp.call_tool(
            "issue_refund", {"case_id": case.id, "txn_id": "T0001", "amount": 999, "reason": "x"}
        )


async def test_send_reply_refused_for_critical(session, case):
    case.tier = "critical"
    session.add(case)
    session.commit()
    with pytest.raises(ToolError):
        await server.mcp.call_tool("send_reply", {"case_id": case.id, "text": "hi"})
    case.tier = "low"
    session.add(case)
    session.commit()
    await server.mcp.call_tool("send_reply", {"case_id": case.id, "text": "hi"})
    session.expire_all()
    assert [d.action for d in session.exec(select(Decision))][-1] == "send_reply"
