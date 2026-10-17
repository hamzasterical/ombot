from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import inbound_email
from app.config import settings
from app.db import get_session
from app.meta import get_json

router = APIRouter()


@router.get("/inbound/email/status")
def status(session: Session = Depends(get_session)):
    cursor = get_json(session, inbound_email.CURSOR_KEY)
    return {
        "enabled": settings.inbound_email_enabled and settings.fastn_enabled,
        "bank_inbox_email": settings.bank_inbox_email or None,
        "poll_seconds": settings.inbound_poll_seconds,
        "query": settings.inbound_gmail_query,
        "cursor_epoch": cursor,
    }


@router.post("/inbound/email/poll")
async def poll_now():
    """Check the inbox right away instead of waiting for the next scheduled poll."""
    try:
        return await inbound_email.poll_once()
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
