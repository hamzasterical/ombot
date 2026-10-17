"""Layer 2: a plain tool-calling loop (no agent framework) over the local tools.

Read-only tools and draft_reply run freely. freeze_payment / issue_refund can only be
*proposed*: they become approval requests that wait for a human (see app/approvals.py).
"""

import asyncio
import json

from pydantic import BaseModel
from sqlmodel import Session, select

from app import approvals, llm
from app.audit import log_decision
from app.config import settings
from app.db import engine
from app.models import Case, Category, Complaint
from app.replies import send_reply
from app.sse import emit
from app.tools import local_tools as tools

SYSTEM = """You are a bank complaint investigator. Investigate the case using the tools, following the bank policies.
Rules:
- Use the read-only tools to verify facts. Do not guess.
- You cannot move money. If a freeze or refund is warranted, call freeze_payment or issue_refund: this only
  creates a proposal that a human must approve.
- Call draft_reply with the message for the customer. Never ask for PINs, passwords or OTPs.
- When finished, reply with JSON only: {"resolution": "<what you found and propose>", "draft_reply": "<customer message>"}"""


class AgentResult(BaseModel):
    resolution: str
    draft_reply: str


def _fn(name: str, description: str, props: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": props, "required": required},
        },
    }


_S = {"type": "string"}
TOOL_DEFS = [
    _fn("get_transaction", "Look up a transaction.", {"txn_id": _S}, ["txn_id"]),
    _fn("get_sender", "Account and customer for a sender account.", {"account_id": _S}, ["account_id"]),
    _fn("get_receiver", "Account and customer for a receiver account.", {"account_id": _S}, ["account_id"]),
    _fn(
        "get_customer_history",
        "Customer profile (home city, usual device), accounts, cards, sent and received transactions, "
        "recent security events and complaint count.",
        {"customer_id": _S, "days": {"type": "integer"}},
        ["customer_id"],
    ),
    _fn(
        "get_security_events",
        "Logins, new devices, password/phone/email changes, SIM swaps and new beneficiaries for a customer.",
        {"customer_id": _S, "days": {"type": "integer"}},
        ["customer_id"],
    ),
    _fn("check_merchant", "Merchant info and complaint count.", {"merchant_id": _S}, ["merchant_id"]),
    _fn("search_policy", "Keyword search over bank policies.", {"query": _S}, ["query"]),
    _fn("draft_reply", "Save the draft customer reply.", {"text": _S}, ["text"]),
    _fn(
        "freeze_payment",
        "PROPOSE freezing a transaction or account. Needs human approval.",
        {"txn_id": _S, "account_id": _S, "reason": _S},
        ["reason"],
    ),
    _fn(
        "issue_refund",
        "PROPOSE refunding part or all of a transaction. Needs human approval.",
        {"txn_id": _S, "amount": {"type": "number"}, "reason": _S},
        ["txn_id", "amount", "reason"],
    ),
]


class _State:
    def __init__(self) -> None:
        self.draft: str | None = None
        self.proposals: list[dict] = []


def _execute_tool(session: Session, case: Case, state: _State, name: str, args: dict) -> dict:
    if "_error" in args:
        return {"error": args["_error"]}
    try:
        match name:
            case "get_transaction":
                return tools.get_transaction(session, args["txn_id"])
            case "get_sender":
                return tools.get_sender(session, args["account_id"])
            case "get_receiver":
                return tools.get_receiver(session, args["account_id"])
            case "get_customer_history":
                return tools.get_customer_history(session, args["customer_id"], int(args.get("days", 90)))
            case "get_security_events":
                return tools.get_security_events(session, args["customer_id"], int(args.get("days", 30)))
            case "check_merchant":
                return tools.check_merchant(session, args["merchant_id"])
            case "search_policy":
                return {"results": tools.search_policy(args["query"])}
            case "draft_reply":
                state.draft = str(args["text"])
                return {"status": "drafted"}
            case "freeze_payment" | "issue_refund":
                params = {k: v for k, v in args.items() if k != "reason"}
                req = approvals.request_approval(session, case.id, name, params)
                state.proposals.append({"approval_id": req.id, "action": name, "params": params, "reason": args["reason"]})
                return {"status": "pending_human_approval", "approval_id": req.id}
            case _:
                return {"error": f"unknown tool {name}"}
    except (KeyError, TypeError, ValueError, approvals.ApprovalError) as e:
        return {"error": f"{type(e).__name__}: {e}"}


def _context(session: Session, case: Case, complaint: Complaint) -> str:
    refs: list[str] = []
    for cat in session.exec(select(Category).where(Category.id.in_(case.categories or []))).all():  # type: ignore[attr-defined]
        refs.extend(cat.policy_refs or [])
    policies = "\n\n".join(p for r in dict.fromkeys(refs) if (p := tools.get_policy(r)))
    return (
        f"Customer id: {complaint.customer_id}\nComplaint: {complaint.text}\n"
        f"Categories: {case.categories}\nReport: {json.dumps(case.report, default=str)}\n\nPolicies:\n{policies}"
    )


async def _loop(session: Session, case: Case, complaint: Complaint, state: _State) -> AgentResult | None:
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": _context(session, case, complaint)},
    ]
    for step in range(1, settings.agent_max_steps + 1):
        turn = await llm.chat_with_tools(settings.agent_model, messages, TOOL_DEFS)
        log_decision(
            session, case.id, "agent", "agent_step", {"step": step}, {"usage": turn.usage}, settings.agent_model
        )
        emit(case.id, "agent_step", {"step": step, "tool_calls": [c.name for c in turn.tool_calls]})
        messages.append(turn.message)

        if turn.tool_calls:
            for call in turn.tool_calls:
                result = _execute_tool(session, case, state, call.name, call.arguments)
                log_decision(
                    session, case.id, "agent", "tool_call", {"name": call.name, "args": call.arguments},
                    {"result": result}, settings.agent_model,
                )
                emit(case.id, "tool_call", {"name": call.name, "args": call.arguments, "result": result})
                messages.append(
                    {"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, default=str)}
                )
            continue

        try:
            return AgentResult.model_validate(llm.extract_json(turn.content or ""))
        except ValueError:  # includes pydantic ValidationError
            messages.append({"role": "user", "content": 'Reply with JSON only: {"resolution": "...", "draft_reply": "..."}'})
    return None  # step limit reached without a valid final answer


async def run_agent(case_id: int, session: Session | None = None) -> None:
    """Run the delegated agent for a case. Always ends with agent_done or error."""
    if session is None:
        with Session(engine) as own:
            return await run_agent(case_id, own)

    case = session.get(Case, case_id)
    if case is None or case.tier != "moderate" or case.status != "agent_running":
        return
    complaint = session.get(Complaint, case.complaint_id)
    state = _State()

    try:
        result = await asyncio.wait_for(
            _loop(session, case, complaint, state), timeout=settings.agent_timeout_seconds
        )
    except Exception as e:  # noqa: BLE001  timeout, API error: a human takes over
        log_decision(session, case.id, "system", "agent_failed", {"error": f"{type(e).__name__}: {e}"})
        case.status = "awaiting_human"
        session.add(case)
        session.commit()
        emit(case.id, "error", {"error": f"{type(e).__name__}: {e}", "status": case.status})
        return

    if result is None:
        log_decision(session, case.id, "system", "agent_failed", {"error": "no valid final answer within step limit"})
        case.status = "awaiting_human"
        emit(case.id, "agent_done", {"status": case.status, "note": "step limit reached"})
    else:
        draft = state.draft or result.draft_reply
        case.report = {
            **case.report,
            "agent_resolution": {"resolution": result.resolution, "draft_reply": draft, "proposals": state.proposals},
        }
        if state.proposals:  # money-moving: wait for a human, send nothing yet
            case.status = "awaiting_approval"
        else:
            await send_reply(session, case, draft, actor="agent", model=settings.agent_model)
            case.status = "resolved"
        emit(case.id, "agent_done", {"status": case.status, "resolution": result.resolution})
    session.add(case)
    session.commit()
