"""Intake pipeline: complaint -> classify -> tier -> evidence -> report -> case."""

from sqlmodel import Session

from app import report as report_mod
from app import routing
from app.agents import low_reply
from app.audit import log_decision
from app.classify import classify
from app.models import Case, Complaint
from app.sse import emit
from app.tools.gateway import get_gateway


async def process_complaint(session: Session, text: str, customer_id: str | None) -> Case:
    complaint = Complaint(text=text, customer_id=customer_id)
    session.add(complaint)
    session.commit()
    session.refresh(complaint)

    # The case is created first so every audit row has a case to point at.
    case = Case(complaint_id=complaint.id, status="new")
    session.add(case)
    session.commit()
    session.refresh(case)

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
