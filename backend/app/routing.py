"""Deterministic tier routing. No LLM is involved here: tier = registry lookup + danger floor."""

import re

from sqlmodel import Session, select

from app.config import settings
from app.models import Category
from app.schemas import CategoryMatch, ClassificationResult

TIER_RANK = {"low": 0, "moderate": 1, "critical": 2}
UNKNOWN = "unknown"


def _normalize(text: str) -> str:
    return text.lower().replace("’", "'").replace("‘", "'")


def usable_matches(classification: ClassificationResult) -> list[CategoryMatch]:
    """Drop matches that are low confidence or lack a supporting quote."""
    return [
        m
        for m in classification.categories
        if m.confidence >= settings.confidence_threshold and m.supporting_quote.strip()
    ]


def lookup_tier(session: Session, category_ids: list[str]) -> str | None:
    """Highest tier among the given categories, or None if none are in the registry."""
    if not category_ids:
        return None
    rows = session.exec(select(Category).where(Category.id.in_(category_ids))).all()  # type: ignore[attr-defined]
    tiers = [r.tier for r in rows if r.tier in TIER_RANK]
    return max(tiers, key=TIER_RANK.__getitem__) if tiers else None


def has_danger_phrase(complaint_text: str) -> bool:
    text = _normalize(complaint_text)
    return any(
        re.search(rf"\b{re.escape(_normalize(p))}\b", text) for p in settings.danger_phrases
    )


def apply_danger_floor(complaint_text: str, current_tier: str) -> str:
    """A danger phrase forces the tier up to at least critical, even if the case is unknown."""
    return "critical" if has_danger_phrase(complaint_text) else current_tier


def determine_tier(session: Session, classification: ClassificationResult, complaint_text: str) -> str:
    """critical | moderate | low | unknown. When unsure, go up, never down."""
    tier = lookup_tier(session, [m.category_id for m in usable_matches(classification)]) or UNKNOWN
    return apply_danger_floor(complaint_text, tier)


def assign_layer(tier: str) -> int | None:
    return {"critical": 1, "moderate": 2, "low": 3}.get(tier)


def determine_status(tier: str) -> str:
    return "auto_replied" if tier == "low" else "awaiting_human"
