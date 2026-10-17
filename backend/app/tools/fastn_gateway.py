"""fastn gateway: calls fastn workflows over HTTP.

fastn is only the outbound layer (notify, ticket, reply). It holds no policy and makes no
decisions: the backend classifies, routes, and approves, then asks fastn to deliver.

Each workflow is executed with  POST {FASTN_GATEWAY_URL}/<id>/execute  and a body of
{"input": {...}}, headers  Authorization: Bearer <key>  and  x-fastn-env: <FASTN_ENV>. <id> is the
workflow id (wf_...) from FASTN_WORKFLOW_IDS, or the workflow name when it has no entry there. A test
key (fsk_test_...) also sends X-fastn-Test-Mode: true. fastn wraps the return value as {"data": {...}}.
The workflow sources live in fastn/workflows/ at the repo root.
    notify_officer       input {complaint_id, category, risk_tier, summary, required_action, officer_email?}
                         -> {success, sent_via, message_id, error}
    create_ticket        input {complaint_id, category, summary, risk_tier, dashboard_url?}
                         -> {success, ticket_id, ticket_url, error}   (fastn deduplicates)
    send_approved_reply  input {complaint_id, reply_text, authorization_token, recipient_email?}
                         -> {success, sent_at, error}

create_ticket and send_approved_reply also get an idempotency_key ("<db instance id>:<complaint_id>",
see app/meta.py) that the workflows dedupe on, so a re-seeded database whose complaint ids restart
at 1 never receives an old ticket or has a reply skipped.

fastn validates authorization_token in send_approved_reply: HMAC-SHA256 with REPLY_AUTH_SECRET of
"<complaint_id>:<sha256(reply_text)>" (see gateway.reply_token).

Failures raise; AuditedGateway (gateway.py) catches them, falls back to LocalGateway, and records
the fallback in the audit log. fastn test keys are NOT a sandbox (they hit live connections): use
only throwaway Slack/email/ClickUp accounts. Money-moving actions are never exposed through fastn.
"""

import logging
from collections.abc import Callable

import httpx

from app.schemas import NotifyResult, SendReplyResult, TicketResult

log = logging.getLogger(__name__)


class FastnGateway:
    def __init__(
        self,
        gateway_url: str,
        api_key: str,
        auth_method: str = "bearer",
        env: str = "live",
        timeout: float = 30.0,
        workflow_ids: dict[str, str] | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        dedupe_key: Callable[[int], str] | None = None,
    ):
        self.gateway_url = gateway_url.rstrip("/")
        self.api_key = api_key
        self.auth_method = auth_method
        self.env = env
        self.timeout = timeout
        self.workflow_ids = workflow_ids or {}
        self._transport = transport  # tests inject a mock transport
        self._dedupe_key = dedupe_key

    def _with_dedupe(self, complaint_id: int, payload: dict) -> dict:
        return {**payload, "idempotency_key": self._dedupe_key(complaint_id)} if self._dedupe_key else payload

    def _headers(self) -> dict[str, str]:
        auth = (
            {"Authorization": f"Bearer {self.api_key}"}
            if self.auth_method == "bearer"
            else {"X-API-Key": self.api_key}
        )
        test_mode = {"X-fastn-Test-Mode": "true"} if self.api_key.startswith("fsk_test_") else {}
        return {**auth, **test_mode, "x-fastn-env": self.env, "Content-Type": "application/json"}

    async def _execute(self, workflow: str, payload: dict) -> dict:
        if not self.gateway_url:
            raise RuntimeError("FASTN_GATEWAY_URL is not set")
        target = self.workflow_ids.get(workflow, workflow)
        async with httpx.AsyncClient(
            headers=self._headers(), transport=self._transport, timeout=self.timeout
        ) as client:
            try:
                response = await client.post(f"{self.gateway_url}/{target}/execute", json={"input": payload})
                response.raise_for_status()
                body = response.json()
            except Exception as e:
                log.error("fastn %s failed: %s", workflow, e)
                raise
        # fastn returns {"data": <workflow return value>}; accept a bare value too
        data = body.get("data", body) if isinstance(body, dict) else body
        if not isinstance(data, dict) or "success" not in data:
            raise RuntimeError(f"fastn {workflow} returned an unexpected body: {str(body)[:200]}")
        return data

    async def notify_officer(
        self,
        complaint_id: int,
        category: str,
        risk_tier: str,
        summary: str,
        required_action: str,
        officer_email: str | None = None,
    ) -> NotifyResult:
        data = await self._execute(
            "notify_officer",
            {
                "complaint_id": str(complaint_id),
                "category": category,
                "risk_tier": risk_tier,
                "summary": summary,
                "required_action": required_action,
                "officer_email": officer_email,
            },
        )
        return NotifyResult(
            success=data.get("success", False),
            sent_via=data.get("sent_via") or "fastn",
            message_id=data.get("message_id"),
            error=data.get("error"),
        )

    async def create_ticket(
        self,
        complaint_id: int,
        category: str,
        summary: str,
        risk_tier: str,
        dashboard_url: str | None = None,
    ) -> TicketResult:
        data = await self._execute(
            "create_ticket",
            self._with_dedupe(
                complaint_id,
                {
                    "complaint_id": str(complaint_id),
                    "category": category,
                    "summary": summary,
                    "risk_tier": risk_tier,
                    "dashboard_url": dashboard_url,
                },
            ),
        )
        return TicketResult(
            success=data.get("success", False),
            ticket_id=data.get("ticket_id"),
            ticket_url=data.get("ticket_url"),
            error=data.get("error"),
        )

    async def send_approved_reply(
        self, complaint_id: int, reply_text: str, authorization_token: str, recipient_email: str | None = None
    ) -> SendReplyResult:
        data = await self._execute(
            "send_approved_reply",
            self._with_dedupe(
                complaint_id,
                {
                    "complaint_id": str(complaint_id),
                    "reply_text": reply_text,
                    "authorization_token": authorization_token,
                    "recipient_email": recipient_email,
                },
            ),
        )
        return SendReplyResult(
            success=data.get("success", False), sent_at=data.get("sent_at"), error=data.get("error")
        )
