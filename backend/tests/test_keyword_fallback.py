"""When the LLM fails, keyword rules still tier clear complaints, and a human always reviews them."""

from sqlmodel import select

from app import classify as classify_mod
from app import evaluation, keyword_fallback, llm
from app.models import Decision
from app.routing import determine_tier
from app.schemas import ClassificationResult, ReportResult

RATE_LIMITED = "RateLimitError: Error code: 429 - free-models-per-day"
KNOWN = {"unauthorized_transaction", "wrong_recipient_transfer", "app_or_login_issue"}


def failing_llm(error=RATE_LIMITED):
    async def structured(*a, **k):
        return llm.LLMResult(None, "m", error=error)

    return structured


def test_rules_pick_registry_categories_with_real_quotes():
    ms = keyword_fallback.match("I sent money to the WRONG ACCOUNT yesterday", KNOWN)
    assert [m.category_id for m in ms] == ["wrong_recipient_transfer"]
    assert ms[0].supporting_quote == "WRONG ACCOUNT"
    assert keyword_fallback.match("the weather is nice", KNOWN) == []
    # Categories missing from the registry are never returned
    assert keyword_fallback.match("I was charged twice", KNOWN) == []


async def test_llm_failure_falls_back_to_keywords(session, case, monkeypatch):
    monkeypatch.setattr(llm, "structured", failing_llm())
    result = await classify_mod.classify(session, case.id, "I see a transfer I never made")
    assert result.raw_category == keyword_fallback.FALLBACK_TAG
    assert determine_tier(session, result, "I see a transfer I never made") == "critical"
    row = session.exec(select(Decision)).one()
    assert row.model == keyword_fallback.FALLBACK_TAG and row.evidence["error"] == RATE_LIMITED


async def test_llm_answer_of_no_category_is_not_overridden(session, case, monkeypatch):
    async def empty(*a, **k):
        return llm.LLMResult(ClassificationResult(), "m")

    monkeypatch.setattr(llm, "structured", empty)
    result = await classify_mod.classify(session, case.id, "I sent money to the wrong account")
    assert result.categories == [] and result.raw_category == "none"


async def test_fallback_can_be_disabled(session, case, monkeypatch):
    monkeypatch.setattr(llm, "structured", failing_llm())
    result = await classify_mod.classify(session, case.id, "wrong account", use_fallback=False)
    assert result.categories == [] and result.raw_category == "none"


def test_low_tier_keyword_case_waits_for_a_human(client, monkeypatch):
    calls = []

    async def structured(model, system, user, schema, **kw):
        calls.append(schema)
        if schema is ClassificationResult:
            return llm.LLMResult(None, "m", error=RATE_LIMITED)
        if schema is ReportResult:  # the model is back by the time the report runs
            return llm.LLMResult(ReportResult(summary="s", category="c", recommended_next_step="n"), "m")
        raise AssertionError("no auto-reply may be generated for a keyword-classified case")

    monkeypatch.setattr(llm, "structured", structured)
    posted = client.post("/api/complaints", json={"text": "The app keeps crashing"}).json()
    case = client.get(f"/api/cases/{posted['id']}").json()
    assert (case["tier"], case["status"], case["assigned_layer"]) == ("low", "awaiting_human", 3)
    assert case["categories"] == ["app_or_login_issue"]
    assert calls == [ClassificationResult, ReportResult]


def test_evaluation_measures_the_llm_without_fallback():
    import inspect

    assert "use_fallback=False" in inspect.getsource(evaluation)
