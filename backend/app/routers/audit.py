from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.agents import low_reply
from app.audit import log_decision
from app.db import get_session
from app.models import Case, Complaint, Decision
from app.schemas import AuditReview, AuditSampleOut, DecisionOut

router = APIRouter()


@router.get("/audit", response_model=list[DecisionOut])
def audit_log(
    case_id: int | None = None,
    action: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    query = select(Decision).order_by(Decision.id.desc()).offset(offset).limit(limit)  # type: ignore[attr-defined]
    if case_id is not None:
        query = query.where(Decision.case_id == case_id)
    if action:
        query = query.where(Decision.action == action)
    return [DecisionOut.model_validate(d, from_attributes=True) for d in session.exec(query).all()]


REVIEW_STATUS = {"looks_fine": "verified_fine", "escalate": "escalated"}


def _sample(session: Session, reply: Decision, review: Decision | None) -> AuditSampleOut:
    case = session.get(Case, reply.case_id)
    complaint = session.get(Complaint, case.complaint_id) if case else None
    return AuditSampleOut(
        case_id=reply.case_id,
        complaint_text=complaint.text if complaint else "",
        reply=str(reply.payload.get("text", "")),
        created_at=reply.created_at,
        customer_id=complaint.customer_id if complaint else None,
        category=case.categories[0] if case and case.categories else None,
        review_status=REVIEW_STATUS[review.payload["verdict"]] if review else "pending",
        reviewed_at=review.created_at if review else None,
    )


def _latest(session: Session, action: str, case_ids: list[int]) -> dict[int, Decision]:
    rows = session.exec(
        select(Decision)
        .where(Decision.action == action, Decision.case_id.in_(case_ids))  # type: ignore[attr-defined]
        .order_by(Decision.id)  # type: ignore[arg-type]
    ).all()
    return {r.case_id: r for r in rows}  # later rows overwrite earlier ones


@router.get("/low-tier/audit-sample", response_model=list[AuditSampleOut])
def low_tier_audit_sample(n: int = Query(25, ge=1, le=100), session: Session = Depends(get_session)):
    """Most recent auto-sent replies with their human review status. Stable order, so a page that
    polls does not reshuffle while someone is reviewing."""
    replies = session.exec(
        select(Decision).where(Decision.action == "auto_reply").order_by(Decision.id.desc()).limit(n)  # type: ignore[attr-defined]
    ).all()
    reviews = _latest(session, "audit_review", [r.case_id for r in replies])
    return [_sample(session, r, reviews.get(r.case_id)) for r in replies]


@router.post("/low-tier/audit-sample/{case_id}/review", response_model=AuditSampleOut)
def review_low_tier_reply(case_id: int, body: AuditReview, session: Session = Depends(get_session)):
    """A human checks an auto-sent reply. Escalating hands the case to a human one tier up."""
    case = session.get(Case, case_id)
    if case is None:
        raise HTTPException(404, "case not found")
    reply = _latest(session, "auto_reply", [case_id]).get(case_id)
    if reply is None:
        raise HTTPException(409, "this case has no auto-sent reply to review")
    review = log_decision(session, case_id, "human", "audit_review", {"verdict": body.action})
    if body.action == "escalate" and case.status == "auto_replied":
        low_reply.escalate(session, case, "human audit of an auto-sent reply")
    return _sample(session, reply, review)
