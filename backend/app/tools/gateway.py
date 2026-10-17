"""Outbound actions behind one interface with two implementations (local, fastn).

Every call, whichever implementation runs, writes an audit row and emits an SSE tool_call event.
If the chosen implementation raises or reports failure, the call falls back to LocalGateway so an
outage never blocks the demo; the fallback is recorded in the audit row.
"""

import hashlib
import hmac
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Protocol

from sqlmodel import Session

from app.audit import log_decision
from app.config import settings
from app.db import engine
from app.models import Case, Complaint, Customer
from app.schemas import NotifyResult, SendReplyResult, TicketResult
from app.sse import emit
from app.tools.local_gateway import LocalGateway


class GatewayError(Exception):
    """The gateway call ran but reported failure."""


class ToolGateway(Protocol):
    async def notify_officer(
        self,
        complaint_id: int,
        category: str,
        risk_tier: str,
        summary: str,
        required_action: str,
        officer_email: str | None = None,
    ) -> NotifyResult: ...
    async def create_ticket(
        self,
        complaint_id: int,
        category: str,
        summary: str,
        risk_tier: str,
        dashboard_url: str | None = None,
    ) -> TicketResult: ...
    async def send_approved_reply(
        self, complaint_id: int, reply_text: str, authorization_token: str, recipient_email: str | None = None
    ) -> SendReplyResult: ...


def reply_token(complaint_id: int, reply_text: str) -> str:
    """Proof that the backend authorized this exact reply. The fastn workflow verifies it."""
    digest = hashlib.sha256(reply_text.encode()).hexdigest()
    key = (settings.reply_auth_secret or settings.fastn_api_key).encode()
    return hmac.new(key, f"{complaint_id}:{digest}".encode(), hashlib.sha256).hexdigest()


class AuditedGateway:
    def __init__(self, inner: ToolGateway, fallback: ToolGateway):
        self.inner = inner
        self.fallback = fallback

    async def _call(
        self,
        method: str,
        case: Case,
        args: dict,
        payload: dict,
        *,
        action: str,
        session: Session | None,
        actor: str,
        model: str | None = None,
        evidence: dict | None = None,
    ):
        used_fallback, error = False, None
        try:
            result = await getattr(self.inner, method)(case.complaint_id, **args)
            if not result.success:
                raise GatewayError(result.error or "gateway reported failure")
        except Exception as e:  # noqa: BLE001  any gateway failure falls back to local
            used_fallback, error = True, f"{type(e).__name__}: {e}"
            result = await getattr(self.fallback, method)(case.complaint_id, **args)

        result_dict = result.model_dump(mode="json")
        ev = {**(evidence or {}), "result": result_dict, "gateway": type(self.inner).__name__}
        if used_fallback:
            ev.update(fallback_used=True, error=error)

        with _session_scope(session) as s:
            log_decision(s, case.id, actor, action, payload, ev, model)
        emit(case.id, "tool_call", {"name": method, **payload, "result": result_dict})
        return result

    async def notify_officer(
        self,
        case: Case,
        category: str,
        risk_tier: str,
        summary: str,
        required_action: str,
        *,
        session: Session | None = None,
        actor: str = "system",
    ) -> NotifyResult:
        args = {
            "category": category,
            "risk_tier": risk_tier,
            "summary": summary,
            "required_action": required_action,
            "officer_email": settings.officer_email or None,
        }
        return await self._call("notify_officer", case, args, args, action="notify_officer", session=session, actor=actor)

    async def create_ticket(
        self,
        case: Case,
        category: str,
        summary: str,
        risk_tier: str,
        *,
        session: Session | None = None,
        actor: str = "system",
    ) -> TicketResult:
        base = settings.dashboard_url.rstrip("/")
        args = {
            "category": category,
            "summary": summary,
            "risk_tier": risk_tier,
            "dashboard_url": f"{base}/cases/{case.id}" if base else None,
        }
        return await self._call("create_ticket", case, args, args, action="create_ticket", session=session, actor=actor)

    async def send_approved_reply(
        self,
        case: Case,
        reply_text: str,
        *,
        session: Session | None = None,
        actor: str = "agent",
        action: str = "send_reply",
        model: str | None = None,
        evidence: dict | None = None,
    ) -> SendReplyResult:
        """The token is attached here, so only backend code paths can produce an authorized send."""
        with _session_scope(session) as s:
            complaint = s.get(Complaint, case.complaint_id)
            customer = s.get(Customer, complaint.customer_id) if complaint and complaint.customer_id else None
            email = customer.email if customer else ""
        args = {
            "reply_text": reply_text,
            "authorization_token": reply_token(case.complaint_id, reply_text),
            "recipient_email": email or None,
        }
        return await self._call(
            "send_approved_reply", case, args, {"text": reply_text},
            action=action, session=session, actor=actor, model=model, evidence=evidence,
        )  # fmt: skip


@contextmanager
def _session_scope(session: Session | None) -> Iterator[Session]:
    """Use the caller's session if given, otherwise open (and close) our own."""
    if session is not None:
        yield session
    else:
        with Session(engine) as own:
            yield own


def get_gateway() -> AuditedGateway:
    if settings.fastn_enabled:
        from app.meta import dedupe_key
        from app.tools.fastn_gateway import FastnGateway

        inner = FastnGateway(
            settings.fastn_gateway_url,
            settings.fastn_api_key,
            settings.fastn_auth_method,
            settings.fastn_env,
            settings.fastn_timeout_seconds,
            settings.fastn_workflow_ids,
            dedupe_key=dedupe_key,
        )
        return AuditedGateway(inner, LocalGateway())
    return AuditedGateway(LocalGateway(), LocalGateway())
