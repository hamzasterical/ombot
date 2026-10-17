from sqlmodel import select

from app import classify as classify_mod
from app import llm
from app.models import Decision
from app.schemas import CategoryMatch, ClassificationResult


def fake_llm(parsed, error=None):
    async def _structured(*args, **kwargs):
        return llm.LLMResult(parsed, "test-model", {"prompt_tokens": 1}, 5, error)

    return _structured


async def test_classify_filters_unknown_ids_and_logs(session, case, monkeypatch):
    parsed = ClassificationResult(
        categories=[
            CategoryMatch(category_id="wrong_recipient_transfer", confidence=0.9, supporting_quote="wrong"),
            CategoryMatch(category_id="made_up", confidence=0.9, supporting_quote="x"),
        ]
    )
    monkeypatch.setattr(llm, "structured", fake_llm(parsed))
    result = await classify_mod.classify(session, case.id, "sent to wrong account")
    assert [m.category_id for m in result.categories] == ["wrong_recipient_transfer"]
    row = session.exec(select(Decision)).one()
    assert (row.actor, row.action, row.model) == ("system", "classify", "test-model")


async def test_classify_failure_routes_to_none(session, case, monkeypatch):
    monkeypatch.setattr(llm, "structured", fake_llm(None, error="boom"))
    result = await classify_mod.classify(session, case.id, "anything")
    assert result.categories == [] and result.raw_category == "none"
