"""Gate for money-moving actions.

HARD RULE: freeze_payment and issue_refund run only from `execute_approved_action`, and only
when a human `approve` decision for that exact request is stored in the audit log. This is
enforced here in code, not in prompts. The agent can only create requests.
"""

from sqlmodel import Session, select

from app.audit import log_decision
from app.models import Account, Case, Decision, Transaction
from app.replies import current_draft, send_reply

MONEY_MOVING = {"freeze_payment", "issue_refund"}


class ApprovalError(Exception):
    """The action cannot run: no approval, already executed, or invalid parameters."""


def validate_params(session: Session, action: str, params: dict) -> None:
    """Raise ApprovalError if the action could not possibly be executed as described."""
    if action == "freeze_payment":
        if params.get("txn_id"):
            if session.get(Transaction, params["txn_id"]) is None:
                raise ApprovalError("transaction not found")
        elif params.get("account_id"):
            if session.get(Account, params["account_id"]) is None:
                raise ApprovalError("account not found")
        else:
            raise ApprovalError("freeze_payment needs txn_id or account_id")
    elif action == "issue_refund":
        txn = session.get(Transaction, params.get("txn_id") or "")
        if txn is None:
            raise ApprovalError("transaction not found")
        amount = params.get("amount")
        if not isinstance(amount, int | float) or amount <= 0 or amount > txn.amount:
            raise ApprovalError(f"refund amount must be > 0 and <= {txn.amount}")
    else:
        raise ApprovalError(f"{action} is not a money-moving action")


def request_approval(session: Session, case_id: int, action: str, params: dict) -> Decision:
    """Log a pending approval request. Nothing is executed."""
    validate_params(session, action, params)
    return log_decision(
        session, case_id, actor="agent", action="approval_requested", payload={"action": action, "params": params}
    )


def _request(session: Session, decision_id: int) -> Decision:
    req = session.get(Decision, decision_id)
    if req is None or req.action != "approval_requested":
        raise ApprovalError("approval request not found")
    return req


def _case_decisions(session: Session, case_id: int, actor: str, action: str) -> list[Decision]:
    return list(
        session.exec(
            select(Decision).where(
                Decision.case_id == case_id, Decision.actor == actor, Decision.action == action
            )
        ).all()
    )


def _by_approval(rows: list[Decision], approval_id: int) -> list[Decision]:
    return [r for r in rows if r.payload.get("approval_id") == approval_id]


def pending_requests(session: Session, case_id: int) -> list[Decision]:
    """Requests that were neither executed nor rejected."""
    done = {
        r.payload.get("approval_id")
        for r in _case_decisions(session, case_id, "system", "action_executed")
        + _case_decisions(session, case_id, "human", "reject")
    }
    return [r for r in _case_decisions(session, case_id, "agent", "approval_requested") if r.id not in done]


def pick_pending(session: Session, case_id: int, approval_id: int | None) -> int:
    pending = pending_requests(session, case_id)
    ids = [r.id for r in pending]
    if approval_id is None:
        if len(ids) != 1:
            raise ApprovalError(f"approval_id required; pending: {ids}")
        return ids[0]
    if approval_id not in ids:
        raise ApprovalError("no such pending approval for this case")
    return approval_id


def execute_approved_action(session: Session, decision_id: int) -> dict:
    """Execute a requested money-moving action iff a stored human approval exists for it."""
    req = _request(session, decision_id)
    approvals = _by_approval(_case_decisions(session, req.case_id, "human", "approve"), decision_id)
    if not approvals:
        raise ApprovalError("no stored human approval for this request")
    if _by_approval(_case_decisions(session, req.case_id, "system", "action_executed"), decision_id):
        raise ApprovalError("already executed")

    action, params = req.payload["action"], req.payload["params"]
    validate_params(session, action, params)
    result = _freeze_payment(session, params) if action == "freeze_payment" else _issue_refund(session, params)
    log_decision(
        session,
        req.case_id,
        actor="system",
        action="action_executed",
        payload={"approval_id": decision_id, "action": action, "params": params},
        evidence={"result": result, "approved_by_decision": approvals[0].id},
    )
    return result


# Private: only reachable through execute_approved_action above.


def _freeze_payment(session: Session, params: dict) -> dict:
    if params.get("txn_id"):
        txn = session.get(Transaction, params["txn_id"])
        txn.status = "frozen"
        session.add(txn)
        session.commit()
        return {"frozen": "transaction", "id": txn.id}
    account = session.get(Account, params["account_id"])
    account.status = "frozen"
    session.add(account)
    session.commit()
    return {"frozen": "account", "id": account.id}


def _issue_refund(session: Session, params: dict) -> dict:
    txn = session.get(Transaction, params["txn_id"])
    account = session.get(Account, txn.sender_account)
    account.balance = round(account.balance + params["amount"], 2)
    session.add(account)
    session.commit()
    return {"refunded": params["amount"], "account": account.id, "new_balance": account.balance}


async def settle_case(session: Session, case: Case) -> None:
    """After a human approve/reject: once no requests are pending, close the case or hand it back."""
    if pending_requests(session, case.id):
        case.status = "awaiting_approval"
    elif _case_decisions(session, case.id, "human", "reject"):
        case.status = "awaiting_human"  # a human rejected something: a human takes over
    else:
        case.status = "resolved"
        draft = current_draft(case)
        if draft:
            await send_reply(session, case, draft, actor="agent")
    session.add(case)
    session.commit()
