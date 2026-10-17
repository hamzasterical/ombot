from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Tier = Literal["critical", "moderate", "low"]


# ---- LLM output ----------------------------------------------------------


class CategoryMatch(BaseModel):
    category_id: str
    confidence: float = Field(ge=0, le=1)
    supporting_quote: str


class ClassificationResult(BaseModel):
    categories: list[CategoryMatch] = Field(default_factory=list)
    raw_category: str | None = None  # "none" if nothing matches


class ReportResult(BaseModel):
    summary: str
    category: str
    likely_causes: list[str] = Field(default_factory=list)
    policy_references: list[str] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    recommended_next_step: str


# ---- API -----------------------------------------------------------------


class ComplaintSubmit(BaseModel):
    text: str = Field(min_length=1)
    customer_id: str | None = None


class PendingApproval(BaseModel):
    """A money-moving action the agent proposed; nothing runs until a human approves it."""

    approval_id: int
    action: str
    params: dict[str, Any]
    reason: str | None = None


class CaseOut(BaseModel):
    id: int
    complaint_id: int
    complaint_text: str
    customer_id: str | None = None
    categories: list[str]
    confidence: dict[str, float]
    quotes: dict[str, str]
    tier: str | None
    status: str
    report: dict[str, Any]
    assigned_layer: int | None
    created_at: datetime
    draft_reply: str | None = None  # human-edited draft, else the agent's
    pending_approvals: list[PendingApproval] = Field(default_factory=list)


class DecisionCreate(BaseModel):
    # resolve: a human sends payload["reply"] (or the current draft) to the customer and closes the case
    action: Literal["approve", "reject", "investigate", "delegate", "map_category", "resolve"]
    payload: dict[str, Any] = Field(default_factory=dict)


class DraftReplyUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class DecisionOut(BaseModel):
    id: int
    case_id: int
    actor: str
    action: str
    payload: dict[str, Any]
    evidence: dict[str, Any]
    model: str | None
    created_at: datetime


class CategoryCreate(BaseModel):
    id: str
    name: str
    tier: Tier
    description: str = ""
    examples: list[str] = Field(default_factory=list)
    causes: list[str] = Field(default_factory=list)
    policy_refs: list[str] = Field(default_factory=list)


class CategoryOut(CategoryCreate):
    source: str


class MetricsOut(BaseModel):
    total_cases: int
    by_tier: dict[str, int]
    by_status: dict[str, int]
    critical_recall: float | None = None
    category_accuracy: float | None = None
    cost_saving_pct: float | None = None
    over_escalation_rate: float | None = None
    unknown_routing_rate: float | None = None  # out-of-list complaints that reached a human
    # sealed test set results from the last POST /api/eval/run (None until one has run)
    last_eval: dict[str, float | None] | None = None
    last_eval_at: datetime | None = None


class EvalResultOut(BaseModel):
    metric_name: str
    value: float | None
    details: dict[str, Any] = Field(default_factory=dict)


class CaseDetail(CaseOut):
    decisions: list[DecisionOut] = Field(default_factory=list)


AuditVerdict = Literal["looks_fine", "escalate"]


class AuditSampleOut(BaseModel):
    case_id: int
    complaint_text: str
    reply: str
    created_at: datetime
    customer_id: str | None = None
    category: str | None = None
    review_status: Literal["pending", "verified_fine", "escalated"] = "pending"
    reviewed_at: datetime | None = None


class AuditReview(BaseModel):
    action: AuditVerdict


# ---- tool gateway results ------------------------------------------------


class NotifyResult(BaseModel):
    success: bool
    sent_via: str = ""
    message_id: str | None = None
    error: str | None = None


class TicketResult(BaseModel):
    success: bool
    ticket_id: str | None = None
    ticket_url: str | None = None
    error: str | None = None


class SendReplyResult(BaseModel):
    success: bool
    sent_at: datetime | None = None
    error: str | None = None
