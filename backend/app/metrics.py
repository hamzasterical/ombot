"""Metrics computed from stored cases, decisions and the labeled test complaints."""

from collections import Counter

from sqlmodel import Session, select

from app.config import settings
from app.meta import get_json
from app.models import Case, Complaint, Decision
from app.schemas import MetricsOut


def _ratio(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


def cost_saving_pct(session: Session) -> float | None:
    """Token cost actually spent vs sending every logged call to the strong model."""
    ratio = settings.strong_cost_ratio
    actual = hypothetical = 0.0
    for d in session.exec(select(Decision)).all():
        usage = (d.evidence or {}).get("usage") or {}
        tokens = usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)
        if not tokens:
            continue
        strong = bool(d.model) and d.model == settings.agent_model
        actual += tokens * (ratio if strong else 1)
        hypothetical += tokens * ratio
    return round((1 - actual / hypothetical) * 100, 2) if hypothetical else None


def compute_metrics(session: Session) -> MetricsOut:
    last_eval = get_json(session, "last_eval")
    pairs = session.exec(select(Case, Complaint).join(Complaint, Complaint.id == Case.complaint_id)).all()
    cases = [c for c, _ in pairs]

    critical = [(c, p) for c, p in pairs if p.true_tier == "critical"]
    reached = sum(1 for c, _ in critical if c.tier == "critical" and c.status != "auto_replied")

    in_list = [(c, p) for c, p in pairs if p.true_category not in (None, "none")]
    correct = sum(1 for c, p in in_list if p.true_category in c.categories)

    low = [(c, p) for c, p in pairs if p.true_tier == "low"]
    pushed_up = sum(1 for c, _ in low if c.tier != "low")

    out_of_list = [c for c, p in pairs if p.true_category == "none"]
    to_human = sum(1 for c in out_of_list if c.tier != "low" and c.status != "auto_replied")

    return MetricsOut(
        total_cases=len(cases),
        by_tier=dict(Counter(c.tier or "unclassified" for c in cases)),
        by_status=dict(Counter(c.status for c in cases)),
        critical_recall=_ratio(reached, len(critical)),
        category_accuracy=_ratio(correct, len(in_list)),
        cost_saving_pct=cost_saving_pct(session),
        over_escalation_rate=_ratio(pushed_up, len(low)),
        unknown_routing_rate=_ratio(to_human, len(out_of_list)),
        last_eval=(last_eval or {}).get("results"),
        last_eval_at=(last_eval or {}).get("at"),
    )
