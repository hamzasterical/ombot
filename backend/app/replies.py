"""Single choke point for outbound customer replies. Delivery goes through the tool gateway."""

from sqlmodel import Session

from app.models import Case
from app.tools.gateway import get_gateway


def current_draft(case: Case) -> str | None:
    """The reply that would go out: a human's edit wins over the agent's draft."""
    report = case.report or {}
    return report.get("human_draft") or (report.get("agent_resolution") or {}).get("draft_reply")


async def send_reply(
    session: Session,
    case: Case,
    text: str,
    actor: str,
    action: str = "send_reply",
    model: str | None = None,
    evidence: dict | None = None,
) -> None:
    """Deliver via the gateway; the gateway writes the audit row and emits the SSE event."""
    await get_gateway().send_approved_reply(
        case, text, session=session, actor=actor, action=action, model=model, evidence=evidence
    )
