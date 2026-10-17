from typing import Any

from sqlmodel import Session

from app.models import Decision


def log_decision(
    session: Session,
    case_id: int,
    actor: str,
    action: str,
    payload: dict[str, Any] | None = None,
    evidence: dict[str, Any] | None = None,
    model: str | None = None,
) -> Decision:
    """Append a row to the audit log. Every classification, report, tool call, and human action goes here."""
    row = Decision(
        case_id=case_id,
        actor=actor,
        action=action,
        payload=payload or {},
        evidence=evidence or {},
        model=model,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
