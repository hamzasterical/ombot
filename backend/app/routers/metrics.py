from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.metrics import compute_metrics
from app.schemas import MetricsOut

router = APIRouter()


@router.get("/metrics", response_model=MetricsOut)
def metrics(session: Session = Depends(get_session)):
    return compute_metrics(session)
