from sqlmodel import Session, select

from app import keyword_fallback, llm
from app.audit import log_decision
from app.config import settings
from app.models import Category, LearningExample
from app.schemas import ClassificationResult

SYSTEM = """You classify bank customer complaints into a fixed list of categories.
Return every category that matches, each with a confidence between 0 and 1 and a short quote
copied from the complaint that justifies it. If nothing fits, return an empty categories list and
set raw_category to "none". Never invent category ids. Do not decide urgency or tier."""


def build_registry_prompt(session: Session) -> str:
    cats = session.exec(select(Category)).all()
    lines = [
        f"- {c.id}: {c.description} Examples: " + "; ".join(c.examples or [])
        for c in cats
    ]
    examples = session.exec(
        select(LearningExample).order_by(LearningExample.id.desc()).limit(10)  # type: ignore[attr-defined]
    ).all()
    text = "Categories:\n" + "\n".join(lines)
    if examples:
        text += "\n\nHuman-labeled examples:\n" + "\n".join(
            f'- "{e.complaint_text}" -> {e.human_category_id}' for e in examples
        )
    return text


async def classify(
    session: Session, case_id: int, complaint_text: str, use_fallback: bool = True
) -> ClassificationResult:
    """Classify via the LLM.

    If the LLM call fails, keyword rules classify instead (raw_category "keyword_fallback"), so a clear
    complaint still gets a tier while the model is rate-limited. If they match nothing, or use_fallback is
    False, returns a 'none' result so the case goes to a human. An LLM that answers "no category" is trusted.
    """
    result = await llm.structured(
        settings.classifier_model,
        SYSTEM + "\n\n" + build_registry_prompt(session),
        complaint_text,
        ClassificationResult,
    )
    known = {c.id for c in session.exec(select(Category)).all()}
    model = result.model
    if result.parsed is None:
        fallback = keyword_fallback.match(complaint_text, known) if use_fallback else []
        if fallback:
            classification = ClassificationResult(categories=fallback, raw_category=keyword_fallback.FALLBACK_TAG)
            model = keyword_fallback.FALLBACK_TAG
        else:
            classification = ClassificationResult(categories=[], raw_category="none")
    else:
        classification = result.parsed
        classification.categories = [m for m in classification.categories if m.category_id in known]
        if not classification.categories:
            classification.raw_category = "none"

    log_decision(
        session,
        case_id,
        actor="system",
        action="classify",
        payload=classification.model_dump(),
        evidence={"usage": result.usage, "latency_ms": result.latency_ms, "error": result.error},
        model=model,
    )
    return classification
