"""Intake pipeline: complaint -> classify -> tier -> evidence -> report -> case.

create_case stores the complaint and a case in status "processing" and returns at once; run_pipeline does the
slow LLM work. The API runs the second part in the background, so a slow or rate-limited model never holds a
request open. process_complaint runs both (email intake, tests).
"""

import logging
from collections.abc import Callable

from sqlmodel import Session, select

from app import report as report_mod
from app import routing
from app.agents import low_reply
from app.audit import log_decision
from app.classify import classify
from app.db import engine
from app.models import Case, Complaint
from app.sse import emit
from app.tools.gateway import get_gateway


log = logging.getLogger(__name__)


def create_case(
    session: Session,
    text: str,
    customer_id: str | None,
    on_complaint: Callable[[Session, int], None] | None = None,
) -> Case:
    complaint = Complaint(text=text, customer_id=customer_id)
    session.add(complaint)
    session.commit()
    session.refresh(complaint)
    if on_complaint:  # e.g. email intake records the Gmail thread before any reply can be sent
        on_complaint(session, complaint.id)

    # The case is created first so every audit row has a case to point at.
    case = Case(complaint_id=complaint.id, status="processing")
    session.add(case)
    session.commit()
    session.refresh(case)
    return case


async def process_complaint(
    session: Session,
    text: str,
    customer_id: str | None,
    on_complaint: Callable[[Session, int], None] | None = None,
) -> Case:
    case = create_case(session, text, customer_id, on_complaint)
    return await run_pipeline(session, case)


async def process_in_background(case_id: int) -> None:
    """Finish a case created by create_case. If the pipeline itself breaks, a human gets the case."""
    with Session(engine) as session:
        case = session.get(Case, case_id)
        if case is None or case.status != "processing":
            return
        try:
            await run_pipeline(session, case)
        except Exception as e:  # noqa: BLE001  never leave a case stuck in "processing"
            log.exception("pipeline failed for case %s", case_id)
            session.rollback()
            case = session.get(Case, case_id)
            case.tier = case.tier or "unknown"
            case.assigned_layer = case.assigned_layer or routing.assign_layer(case.tier) or 1
            case.status = "awaiting_human"
            session.add(case)
            session.commit()
            log_decision(session, case_id, "system", "pipeline_failed", {"error": f"{type(e).__name__}: {e}"})
            emit(case_id, "error", {"error": f"{type(e).__name__}: {e}", "status": case.status})


def recover_interrupted(session: Session) -> int:
    """After a restart, cases whose work lived in memory (pipeline, agent run) go to a human."""
    stuck = session.exec(select(Case).where(Case.status.in_(["processing", "agent_running"]))).all()  # type: ignore[attr-defined]
    for case in stuck:
        was = case.status
        case.tier = case.tier or "unknown"
        case.assigned_layer = case.assigned_layer or routing.assign_layer(case.tier) or 1
        case.status = "awaiting_human"
        session.add(case)
        session.commit()
        log_decision(session, case.id, "system", "recovered", {"was": was, "reason": "server restarted mid-run"})
    return len(stuck)


async def run_pipeline(session: Session, case: Case) -> Case:
    complaint = session.get(Complaint, case.complaint_id)
    text, customer_id = complaint.text, complaint.customer_id

    classification = await classify(session, case.id, text)
    emit(case.id, "classify", classification.model_dump())

    tier = routing.determine_tier(session, classification, text)
    matches = routing.usable_matches(classification)
    case.categories = [m.category_id for m in matches]
    case.confidence = {m.category_id: m.confidence for m in matches}
    case.quotes = {m.category_id: m.supporting_quote for m in matches}
    case.tier = tier
    case.assigned_layer = routing.assign_layer(tier)
    # Low tier stays "new" until the Layer 3 reply is actually sent.
    case.status = "new" if tier == "low" else routing.determine_status(tier)
    session.add(case)
    session.commit()
    log_decision(
        session,
        case.id,
        actor="system",
        action="route",
        payload={"tier": tier, "layer": case.assigned_layer, "categories": case.categories},
    )

    evidence = report_mod.gather_evidence(session, customer_id, text)
    emit(case.id, "evidence_fetch", {"keys": list(evidence)})

    report = await report_mod.generate(session, case, text, classification, evidence)
    emit(case.id, "report_generated", {"ok": report is not None})

    summary = ((case.report or {}).get("summary") or text)[:200]
    category = case.categories[0] if case.categories else "unknown"
    gateway = get_gateway()
    if tier in ("critical", "unknown"):
        action = "Review critical case" if tier == "critical" else "Map unknown complaint to a category"
        await gateway.notify_officer(case, category, tier, summary, action, session=session)
    if tier == "critical":
        await gateway.create_ticket(case, category, summary, tier, session=session)

    if report is None:
        case.status = "awaiting_human"  # never auto-reply without a report
    elif tier == "low":
        await low_reply.run(session, case)
    session.add(case)
    session.commit()
    session.refresh(case)
    return case
