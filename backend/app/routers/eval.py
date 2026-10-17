from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import meta
from app.db import get_session
from app.evaluation import EvalConfigError, evaluate
from app.schemas import EvalResultOut

router = APIRouter()
LAST_EVAL_KEY = "last_eval"


@router.post("/eval/run", response_model=list[EvalResultOut])
async def run_eval(session: Session = Depends(get_session)):
    """Run the sealed test set (one LLM call per complaint, plus a held-out re-run). Takes a while."""
    try:
        results = await evaluate(session)
    except EvalConfigError as e:
        raise HTTPException(503, str(e)) from e
    # Kept so /api/metrics can show the sealed-test numbers after the run
    meta.set_json(
        session,
        LAST_EVAL_KEY,
        {"at": datetime.now(UTC).isoformat(), "results": {r.metric_name: r.value for r in results}},
    )
    return results
