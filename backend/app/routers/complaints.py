from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Customer
from app.pipeline import process_complaint
from app.routers.cases import case_out
from app.schemas import CaseOut, ComplaintSubmit

router = APIRouter()


@router.post("/complaints", response_model=CaseOut)
async def submit_complaint(body: ComplaintSubmit, session: Session = Depends(get_session)):
    if body.customer_id and session.get(Customer, body.customer_id) is None:
        raise HTTPException(404, "customer not found")
    case = await process_complaint(session, body.text, body.customer_id)
    return case_out(session, case)
