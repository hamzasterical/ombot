"""Local gateway: always works, delivers nothing outside the process."""

import logging
from datetime import UTC, datetime

from app.schemas import NotifyResult, SendReplyResult, TicketResult

log = logging.getLogger("ombot.gateway")


class LocalGateway:
    async def notify_officer(
        self,
        complaint_id: int,
        category: str,
        risk_tier: str,
        summary: str,
        required_action: str,
        officer_email: str | None = None,
    ) -> NotifyResult:
        log.info("[MOCK] notify officer: complaint %s (%s, %s): %s", complaint_id, category, risk_tier, required_action)
        return NotifyResult(success=True, sent_via="mock", message_id=f"mock-{complaint_id}")

    async def create_ticket(
        self,
        complaint_id: int,
        category: str,
        summary: str,
        risk_tier: str,
        dashboard_url: str | None = None,
    ) -> TicketResult:
        log.info("[MOCK] ticket: complaint %s (%s, %s)", complaint_id, category, risk_tier)
        return TicketResult(success=True, ticket_id=f"MOCK-{complaint_id}")

    async def send_approved_reply(
        self,
        complaint_id: int,
        reply_text: str,
        authorization_token: str,
        recipient_email: str | None = None,
        reply_to_sender: bool = False,
        thread: dict | None = None,
    ) -> SendReplyResult:
        log.info("[MOCK] reply to %s for complaint %s", recipient_email or "<no email on file>", complaint_id)
        return SendReplyResult(success=True, sent_at=datetime.now(UTC))
