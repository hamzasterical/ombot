import re

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.audit import log_decision
from app.db import get_session
from app.models import Case, Category
from app.schemas import CategoryCreate, CategoryOut

router = APIRouter()
ID_PATTERN = re.compile(r"^[a-z0-9_]{2,64}$")


def _out(c: Category) -> CategoryOut:
    return CategoryOut(
        id=c.id,
        name=c.name,
        tier=c.tier,  # type: ignore[arg-type]
        description=c.description,
        examples=c.examples,
        causes=c.causes,
        policy_refs=c.policy_refs,
        source=c.source,
    )


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(session: Session = Depends(get_session)):
    return [_out(c) for c in session.exec(select(Category).order_by(Category.id)).all()]  # type: ignore[arg-type]


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    body: CategoryCreate, case_id: int | None = None, session: Session = Depends(get_session)
):
    """A human adds a category and its tier (learning loop). Pass case_id to record it in that case's audit trail."""
    if not ID_PATTERN.match(body.id):
        raise HTTPException(422, "id must be 2-64 chars of a-z, 0-9, underscore")
    if session.get(Category, body.id):
        raise HTTPException(409, "category already exists")
    category = Category(**body.model_dump(), source="human_added")
    session.add(category)
    session.commit()
    if case_id is not None and session.get(Case, case_id):
        log_decision(session, case_id, "human", "create_category", payload=body.model_dump())
    return _out(category)
