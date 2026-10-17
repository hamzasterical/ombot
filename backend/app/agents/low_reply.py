"""Layer 3: a cheap model drafts a short reply to a low-risk complaint. This is its only task."""

import re

from pydantic import BaseModel
from sqlmodel import Session

from app import llm, routing
from app.audit import log_decision
from app.config import settings
from app.models import Case, Complaint
from app.replies import send_reply
from app.sse import emit

SYSTEM = """You write a short, polite customer-service reply (max 4 sentences) for a bank.
Use only the policy guidance given. Never ask for PINs, passwords or OTPs. Never promise refunds.
If the customer describes money lost, a payment problem, or anything serious or unresolved,
set needs_escalation to true and explain briefly in escalation_reason."""

NEXT_TIER = {"low": "moderate", "moderate": "critical", "critical": "critical"}


class LowReply(BaseModel):
    reply: str
    needs_escalation: bool = False
    escalation_reason: str = ""


def _hints_serious(text: str) -> bool:
    text = text.lower()
    return any(re.search(rf"\b{re.escape(p.lower())}\b", text) for p in settings.escalation_phrases)


def escalate(session: Session, case: Case, reason: str) -> None:
    """Bump one tier up and hand to a human. No reply is sent."""
    new_tier = NEXT_TIER.get(case.tier or "low", "moderate")
    log_decision(
        session,
        case.id,
        actor="system",
        action="escalate",
        payload={"from": case.tier, "to": new_tier, "reason": reason},
    )
    case.tier = new_tier
    case.assigned_layer = routing.assign_layer(new_tier)
    case.status = "awaiting_human"
    session.add(case)
    session.commit()
    emit(case.id, "decision", {"action": "escalate", "to": new_tier, "reason": reason})


async def run(session: Session, case: Case) -> None:
    complaint = session.get(Complaint, case.complaint_id)
    text = complaint.text

    if _hints_serious(text):  # deterministic check before spending a token
        return escalate(session, case, "complaint text hints at lost money or an unresolved issue")

    summary = (case.report or {}).get("summary", "")
    result = await llm.structured(
        settings.low_tier_reply_model,
        SYSTEM,
        f"Complaint:\n{text}\n\nCase summary:\n{summary}\n\nPolicy notes:\n{(case.report or {}).get('recommended_next_step', '')}",
        LowReply,
    )
    if result.parsed is None:
        log_decision(
            session, case.id, "system", "low_reply_failed", evidence={"error": result.error}, model=result.model
        )
        case.status = "awaiting_human"
        session.add(case)
        session.commit()
        return None

    reply = result.parsed
    if reply.needs_escalation or _hints_serious(reply.reply):
        return escalate(session, case, reply.escalation_reason or "reply drafting flagged a serious issue")

    await send_reply(
        session,
        case,
        reply.reply,
        actor="agent",
        action="auto_reply",
        model=result.model,
        evidence={"usage": result.usage, "latency_ms": result.latency_ms},
    )
    case.status = "auto_replied"
    session.add(case)
    session.commit()
    return None
