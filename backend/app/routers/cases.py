import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from app import approvals, routing, sse
from app.agents import low_reply, moderate_agent, review_gate
from app.audit import log_decision
from app.db import get_session
from app.models import Case, Category, Complaint, Decision, LearningExample
from app.replies import current_draft, send_reply
from app.schemas import (
    AgentReviewCreate,
    AgentReviewState,
    CaseDetail,
    CaseOut,
    DecisionCreate,
    DecisionOut,
    DraftReplyUpdate,
    PendingApproval,
)

router = APIRouter()


def _pending(session: Session, case: Case) -> list[PendingApproval]:
    if case.status != "awaiting_approval":
        return []
    reasons = {
        p.get("approval_id"): p.get("reason")
        for p in ((case.report or {}).get("agent_resolution") or {}).get("proposals", [])
    }
    return [
        PendingApproval(
            approval_id=r.id, action=r.payload["action"], params=r.payload["params"], reason=reasons.get(r.id)
        )
        for r in approvals.pending_requests(session, case.id)
    ]


def _touched_ids(session: Session, case_ids: list[int]) -> set[int]:
    """Cases a human has acted on at least once (any human decision in the audit log)."""
    if not case_ids:
        return set()
    rows = session.exec(
        select(Decision.case_id).where(Decision.actor == "human", Decision.case_id.in_(case_ids)).distinct()  # type: ignore[attr-defined]
    )
    return set(rows)


def workflow_of(case: Case, touched: bool) -> str:
    if case.status in ("resolved", "auto_replied"):
        return "solved"
    if touched or case.status in ("agent_running", "awaiting_approval"):
        return "investigating"
    return "unchecked"


def case_out(session: Session, case: Case, touched: set[int] | None = None) -> CaseOut:
    complaint = session.get(Complaint, case.complaint_id)
    if touched is None:
        touched = _touched_ids(session, [case.id])
    return CaseOut(
        id=case.id,
        complaint_id=case.complaint_id,
        complaint_text=complaint.text if complaint else "",
        customer_id=complaint.customer_id if complaint else None,
        categories=case.categories,
        confidence=case.confidence,
        quotes=case.quotes,
        tier=case.tier,
        status=case.status,
        report=case.report,
        assigned_layer=case.assigned_layer,
        created_at=case.created_at,
        draft_reply=current_draft(case),
        pending_approvals=_pending(session, case),
        workflow=workflow_of(case, case.id in touched),
    )


def _get_case(session: Session, case_id: int) -> Case:
    case = session.get(Case, case_id)
    if case is None:
        raise HTTPException(404, "case not found")
    return case


def _start_delegation(
    session: Session, case: Case, background: BackgroundTasks, review_mode: review_gate.Mode = "auto"
) -> None:
    # Critical cases are never handled by an LLM; only a moderate case waiting on a human can be delegated.
    if case.tier != "moderate" or case.status != "awaiting_human":
        raise HTTPException(409, "only moderate cases awaiting a human can be delegated")
    case.status = "agent_running"
    case.assigned_layer = 2
    session.add(case)
    session.commit()
    if review_mode != "auto":  # opened before the task starts so a fast reviewer cannot miss it
        review_gate.open_gate(case.id, review_mode)
    background.add_task(moderate_agent.run_agent, case.id)


@router.get("/cases", response_model=list[CaseOut])
def list_cases(
    tier: str | None = None,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    query = select(Case).order_by(Case.id.desc()).offset(offset).limit(limit)  # type: ignore[attr-defined]
    if tier:
        query = query.where(Case.tier == tier)
    if status:
        query = query.where(Case.status == status)
    cases = session.exec(query).all()
    touched = _touched_ids(session, [c.id for c in cases])
    return [case_out(session, c, touched) for c in cases]


@router.get("/cases/{case_id}", response_model=CaseDetail)
def get_case(case_id: int, session: Session = Depends(get_session)):
    case = _get_case(session, case_id)
    decisions = session.exec(
        select(Decision).where(Decision.case_id == case_id).order_by(Decision.id)  # type: ignore[arg-type]
    ).all()
    return CaseDetail(
        **case_out(session, case).model_dump(),
        decisions=[DecisionOut.model_validate(d, from_attributes=True) for d in decisions],
    )


@router.post("/cases/{case_id}/decision", response_model=CaseOut)
async def decide(
    case_id: int,
    body: DecisionCreate,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
):
    case = _get_case(session, case_id)

    if body.action in ("approve", "reject"):
        return await _decide_approval(session, case, body)
    if body.action == "resolve":
        return await _resolve(session, case, body.payload)

    if body.action == "delegate":
        _start_delegation(session, case, background, _review_mode(body.payload.get("mode")))
    elif body.action == "investigate":
        case.assigned_layer = 1
        case.status = "awaiting_human"
    elif body.action == "map_category":
        await _map_category(session, case, body.payload)

    session.add(case)
    session.commit()
    log_decision(session, case.id, actor="human", action=body.action, payload=body.payload)
    sse.emit(case.id, "decision", {"action": body.action, "status": case.status})
    session.refresh(case)
    return case_out(session, case)


async def _decide_approval(session: Session, case: Case, body: DecisionCreate) -> CaseOut:
    """Human approves or rejects a pending money-moving request. Approval is stored before anything runs."""
    if case.status != "awaiting_approval":
        raise HTTPException(409, "case has no pending approval")
    try:
        approval_id = approvals.pick_pending(session, case.id, body.payload.get("approval_id"))
    except approvals.ApprovalError as e:
        raise HTTPException(409, str(e)) from e

    log_decision(session, case.id, "human", body.action, {**body.payload, "approval_id": approval_id})
    if body.action == "approve":
        try:
            result = approvals.execute_approved_action(session, approval_id)
        except approvals.ApprovalError as e:
            raise HTTPException(409, str(e)) from e
        sse.emit(case.id, "tool_call", {"name": "approved_action", "approval_id": approval_id, "result": result})
    await approvals.settle_case(session, case)
    sse.emit(case.id, "decision", {"action": body.action, "status": case.status})
    session.refresh(case)
    return case_out(session, case)


async def _resolve(session: Session, case: Case, payload: dict) -> CaseOut:
    """A human approves a reply and closes the case. Money-moving requests go through approve instead."""
    if case.status != "awaiting_human" or case.tier not in ("critical", "moderate"):
        raise HTTPException(409, "only critical or moderate cases awaiting a human can be resolved")
    reply = str(payload.get("reply") or current_draft(case) or "").strip()
    if not reply:
        raise HTTPException(422, "no reply to send: pass payload.reply or save a draft first")
    log_decision(session, case.id, "human", "resolve", {"reply": reply})
    await send_reply(session, case, reply, actor="human")
    case.status = "resolved"
    session.add(case)
    session.commit()
    sse.emit(case.id, "decision", {"action": "resolve", "status": case.status})
    session.refresh(case)
    return case_out(session, case)


@router.patch("/cases/{case_id}/draft-reply", response_model=CaseOut)
def save_draft_reply(case_id: int, body: DraftReplyUpdate, session: Session = Depends(get_session)):
    """A human edits the reply before it is sent. Their edit replaces the agent's draft."""
    case = _get_case(session, case_id)
    if case.status in ("resolved", "auto_replied"):
        raise HTTPException(409, "the reply for this case was already sent")
    case.report = {**(case.report or {}), "human_draft": body.text}
    session.add(case)
    session.commit()
    log_decision(session, case.id, "human", "edit_draft", {"text": body.text})
    session.refresh(case)
    return case_out(session, case)


async def _map_category(session: Session, case: Case, payload: dict) -> None:
    """Learning loop: a human maps an unknown case to a registry category."""
    if case.tier != "unknown":
        raise HTTPException(409, "only unknown-category cases can be mapped")
    category = session.get(Category, str(payload.get("category_id", "")))
    if category is None:
        raise HTTPException(404, "category not found; create it via POST /api/categories first")
    complaint = session.get(Complaint, case.complaint_id)
    session.add(LearningExample(complaint_text=complaint.text, human_category_id=category.id))

    tier = routing.apply_danger_floor(complaint.text, category.tier)
    case.categories = [category.id]
    case.confidence = {category.id: 1.0}
    case.quotes = {category.id: "mapped by human"}
    case.tier = tier
    case.assigned_layer = routing.assign_layer(tier)
    case.status = "new" if tier == "low" else routing.determine_status(tier)
    session.add(case)
    session.commit()
    if tier == "low":
        await low_reply.run(session, case)


def _review_mode(value: object) -> review_gate.Mode:
    if value in (None, "", "auto"):
        return "auto"
    if value not in ("all", "risky"):
        raise HTTPException(422, "mode must be auto, risky or all")
    return value  # type: ignore[return-value]


@router.post("/cases/{case_id}/delegate", response_model=CaseOut)
def delegate(
    case_id: int,
    background: BackgroundTasks,
    mode: str = Query("auto", description="auto: agent runs alone; all/risky: reviewer approves its steps"),
    session: Session = Depends(get_session),
):
    case = _get_case(session, case_id)
    review_mode = _review_mode(mode)
    _start_delegation(session, case, background, review_mode)
    log_decision(session, case.id, actor="human", action="delegate", payload={"mode": review_mode})
    sse.emit(case.id, "decision", {"action": "delegate", "status": case.status})
    session.refresh(case)
    return case_out(session, case)


@router.get("/cases/{case_id}/agent/review", response_model=AgentReviewState)
def agent_review_state(case_id: int, session: Session = Depends(get_session)):
    _get_case(session, case_id)
    return AgentReviewState(mode=review_gate.mode(case_id), pending=review_gate.pending(case_id))


@router.post("/cases/{case_id}/agent/review", response_model=AgentReviewState)
def agent_review(case_id: int, body: AgentReviewCreate, session: Session = Depends(get_session)):
    """Answer the step a supervised agent is waiting on, and/or change how much it pauses."""
    _get_case(session, case_id)
    if body.verdict and body.call_no is None:
        raise HTTPException(422, "call_no is required with a verdict")
    review = (
        review_gate.Review(body.verdict, body.note, body.args) if body.verdict else None
    )
    try:
        review_gate.submit(case_id, body.call_no, review, body.mode)
    except review_gate.ReviewError as e:
        raise HTTPException(409, str(e)) from e
    return AgentReviewState(mode=review_gate.mode(case_id), pending=review_gate.pending(case_id))


@router.get("/cases/{case_id}/stream")
async def stream(case_id: int, session: Session = Depends(get_session)):
    _get_case(session, case_id)

    async def events():
        async for item in sse.subscribe(case_id):
            yield {"event": item["event"], "data": json.dumps(item["data"], default=str)}

    return EventSourceResponse(events())
