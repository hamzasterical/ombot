from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Customer
from app.pipeline import create_case, process_in_background
from app.routers.cases import case_out
from app.schemas import CaseOut, ComplaintSubmit

router = APIRouter()


@router.post("/complaints", response_model=CaseOut)
def submit_complaint(body: ComplaintSubmit, background: BackgroundTasks, session: Session = Depends(get_session)):
    """Store the complaint and return at once (status "processing"); classification and the report finish in the background."""
    if body.customer_id and session.get(Customer, body.customer_id) is None:
        raise HTTPException(404, "customer not found")
    case = create_case(session, body.text, body.customer_id)
    background.add_task(process_in_background, case.id)
    return case_out(session, case)
