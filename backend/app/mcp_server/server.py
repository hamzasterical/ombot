"""Our own MCP server: policies and the category registry as resources, plus local tool fallbacks.

Run standalone (it is a separate process from the FastAPI app):
    uv run python -m app.mcp_server.server                     # stdio
    uv run python -m app.mcp_server.server --http --port 8001  # streamable HTTP

Money-moving tools only PROPOSE. `freeze_payment` and `issue_refund` create a pending approval
request; they execute only when a human approves via POST /api/cases/{id}/decision
(see app/approvals.py). There is no code path from this server to a money-moving action
without a stored human approval.
"""

import argparse
import json
from collections.abc import Iterator
from contextlib import contextmanager

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ResourceNotFoundError, ToolError
from sqlmodel import Session, select

from app import approvals
from app.audit import log_decision
from app.db import engine
from app.models import Case, Category
from app.replies import send_reply as send_reply_logged
from app.tools import local_tools as tools

mcp = MCPServer(
    "ombot",
    instructions=(
        "Bank complaint triage. Resources: categories://registry and policies://{policy_id} "
        "(sample bank policies). Read-only lookup tools are free to use; freeze_payment and "
        "issue_refund only create proposals that a human must approve."
    ),
)


@contextmanager
def _session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def _case(session: Session, case_id: int) -> Case:
    case = session.get(Case, case_id)
    if case is None:
        raise ToolError(f"case {case_id} not found")
    return case


# ---- resources ---------------------------------------------------------------


@mcp.resource("categories://registry", mime_type="application/json")
def category_registry() -> str:
    """The bank's complaint category registry (id, tier, description, examples, causes)."""
    with _session() as session:
        rows = session.exec(select(Category).order_by(Category.id)).all()  # type: ignore[arg-type]
        return json.dumps(
            [
                {
                    "id": c.id,
                    "name": c.name,
                    "tier": c.tier,
                    "description": c.description,
                    "example_complaints": c.examples,
                    "possible_causes": c.causes,
                    "policy_refs": c.policy_refs,
                    "source": c.source,
                }
                for c in rows
            ]
        )


@mcp.resource("policies://{policy_id}", mime_type="text/markdown")
def policy(policy_id: str) -> str:
    """A sample bank policy document, e.g. policies://policy_unauthorized_txn."""
    text = tools.get_policy(policy_id)
    if text is None:
        raise ResourceNotFoundError(f"policy {policy_id} not found")
    return text


# ---- read-only tools -----------------------------------------------------------


@mcp.tool()
def get_transaction(txn_id: str) -> dict:
    """Look up a transaction by id."""
    with _session() as s:
        return tools.get_transaction(s, txn_id)


@mcp.tool()
def get_sender(account_id: str) -> dict:
    """Account and customer details for a sender account."""
    with _session() as s:
        return tools.get_sender(s, account_id)


@mcp.tool()
def get_receiver(account_id: str) -> dict:
    """Account and customer details for a receiver account."""
    with _session() as s:
        return tools.get_receiver(s, account_id)


@mcp.tool()
def get_customer_history(customer_id: str, days: int = 90) -> dict:
    """Recent transactions and complaint count for a customer."""
    with _session() as s:
        return tools.get_customer_history(s, customer_id, days)


@mcp.tool()
def get_security_events(customer_id: str, days: int = 30) -> dict:
    """Logins, new devices, credential changes, SIM swaps and new beneficiaries for a customer."""
    with _session() as s:
        return tools.get_security_events(s, customer_id, days)


@mcp.tool()
def check_merchant(merchant_id: str) -> dict:
    """Merchant details and complaint count."""
    with _session() as s:
        return tools.check_merchant(s, merchant_id)


@mcp.tool()
def search_policy(query: str) -> list[dict]:
    """Keyword search across the sample bank policies."""
    return tools.search_policy(query)


# ---- safe writes -----------------------------------------------------------------


@mcp.tool()
def draft_reply(case_id: int, text: str) -> dict:
    """Save a draft customer reply on a case. Does not send anything."""
    with _session() as s:
        case = _case(s, case_id)
        log_decision(s, case.id, actor="agent", action="draft_reply", payload={"text": text})
    return {"status": "drafted"}


@mcp.tool()
async def send_reply(case_id: int, text: str) -> dict:
    """Send a reply to the customer. Refused for critical and unclassified cases: only humans answer those."""
    with _session() as s:
        case = _case(s, case_id)
        if case.tier not in ("low", "moderate"):
            raise ToolError("replies on critical or unclassified cases are written by a human")
        await send_reply_logged(s, case, text, actor="agent")
    return {"status": "sent"}


# ---- money-moving tools: propose only ----------------------------------------------


@mcp.tool()
def freeze_payment(case_id: int, reason: str, txn_id: str = "", account_id: str = "") -> dict:
    """PROPOSE freezing a transaction or account. Creates a pending request; a human must approve."""
    return _propose(case_id, "freeze_payment", {"txn_id": txn_id, "account_id": account_id}, reason)


@mcp.tool()
def issue_refund(case_id: int, txn_id: str, amount: float, reason: str) -> dict:
    """PROPOSE a refund. Creates a pending request; a human must approve."""
    return _propose(case_id, "issue_refund", {"txn_id": txn_id, "amount": amount}, reason)


def _propose(case_id: int, action: str, params: dict, reason: str) -> dict:
    params = {k: v for k, v in params.items() if v not in ("", None)}
    with _session() as s:
        case = _case(s, case_id)
        try:
            req = approvals.request_approval(s, case.id, action, params)
        except approvals.ApprovalError as e:
            raise ToolError(str(e)) from e
        log_decision(
            s, case.id, actor="agent", action="proposal_reason", payload={"approval_id": req.id, "reason": reason}
        )
        if case.status != "awaiting_approval":
            case.status = "awaiting_approval"
            s.add(case)
            s.commit()
        return {"status": "pending_human_approval", "approval_id": req.id}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--http", action="store_true", help="serve streamable HTTP instead of stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    if args.http:
        mcp.run("streamable-http", host=args.host, port=args.port)
    else:
        mcp.run()
