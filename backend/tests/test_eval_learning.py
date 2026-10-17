import json

import pytest

from app import evaluation, llm
from app.agents.low_reply import LowReply
from app.config import settings
from app.evaluation import EvalConfigError, evaluate
from app.models import Category, LearningExample
from app.schemas import CategoryMatch, ClassificationResult, ReportResult
from app.seed_data import CATEGORIES

LABELED = {i["text"]: i for i in json.loads(evaluation.LABELED.read_text(encoding="utf-8"))}


@pytest.fixture
def seeded(session):
    for cid, name, tier, *_ in CATEGORIES:
        if session.get(Category, cid) is None:
            session.add(Category(id=cid, name=name, tier=tier, source="seed"))
    session.commit()
    return session


def cls_for(cid):
    return ClassificationResult(
        categories=[CategoryMatch(category_id=cid, confidence=0.95, supporting_quote="q")]
    )


async def test_perfect_classifier_scores_perfectly(seeded, monkeypatch):
    async def structured(model, system, user, schema, **kw):
        truth = LABELED[user]["true_category"]
        return llm.LLMResult(
            ClassificationResult() if truth == "none" else cls_for(truth), "m", {"prompt_tokens": 5, "completion_tokens": 1}
        )

    monkeypatch.setattr(llm, "structured", structured)
    monkeypatch.setattr(settings, "classifier_model", "m")
    results = {r.metric_name: r for r in await evaluate(seeded)}
    assert results["critical_recall"].value == 1.0
    assert results["category_accuracy"].value == 1.0
    assert results["unknown_routing_rate"].value == 1.0
    assert results["over_escalation_rate"].value == 0.0
    assert results["cost_saving_pct"].value == 90.0
    assert results["failures"].value == 0 and results["learning_effect"].value == 0
    # the throwaway eval DB leaves the live one untouched
    assert seeded.exec(__import__("sqlmodel").select(LearningExample)).all() == []


async def test_learning_effect_is_measured_on_held_out_items(seeded, monkeypatch):
    """A classifier that only knows a category once it has seen a taught example for it."""

    async def structured(model, system, user, schema, **kw):
        truth = LABELED[user]["true_category"]
        if truth == "none":
            return llm.LLMResult(ClassificationResult(), "m")
        return llm.LLMResult(cls_for(truth) if f"-> {truth}" in system else ClassificationResult(), "m")

    monkeypatch.setattr(llm, "structured", structured)
    monkeypatch.setattr(settings, "classifier_model", "m")
    results = {r.metric_name: r for r in await evaluate(seeded)}
    effect = results["learning_effect"]
    assert effect.details["examples_taught"] > 0
    assert effect.details["misroutes_after"] < effect.details["misroutes_before"]
    assert effect.value > 0
    assert results["category_accuracy"].value < 0.5  # baseline knew nothing


async def test_eval_requires_configuration(seeded, monkeypatch):
    monkeypatch.setattr(settings, "classifier_model", "")
    with pytest.raises(EvalConfigError):
        await evaluate(seeded)


def test_eval_endpoint_503_when_unconfigured(client, monkeypatch):
    monkeypatch.setattr(settings, "classifier_model", "")
    assert client.post("/api/eval/run").status_code == 503


def test_demo_learning_loop_end_to_end(client, monkeypatch):
    """Unseen complaint type escalates once; after a human teaches it, a similar one is handled automatically."""

    async def structured(model, system, user, schema, **kw):
        if schema is ClassificationResult:
            taught = "-> branch_hours" in system and "branch" in user
            return llm.LLMResult(cls_for("branch_hours") if taught else ClassificationResult(), "m")
        if schema is ReportResult:
            return llm.LLMResult(ReportResult(summary="s", category="c", recommended_next_step="n"), "m")
        return llm.LLMResult(LowReply(reply="We open at 9am."), "cheap")

    monkeypatch.setattr(llm, "structured", structured)

    first = client.post("/api/complaints", json={"text": "When does the branch on Main Street open?"}).json()
    assert (first["tier"], first["status"]) == ("unknown", "awaiting_human")

    assert client.post(
        "/api/categories", json={"id": "branch_hours", "name": "Branch hours", "tier": "low"}
    ).status_code == 201
    mapped = client.post(
        f"/api/cases/{first['id']}/decision",
        json={"action": "map_category", "payload": {"category_id": "branch_hours"}},
    ).json()
    assert (mapped["tier"], mapped["status"]) == ("low", "auto_replied")

    second = client.post("/api/complaints", json={"text": "What time does your branch close on Fridays?"}).json()
    assert (second["tier"], second["status"], second["categories"]) == ("low", "auto_replied", ["branch_hours"])
    assert len(client.get("/api/low-tier/audit-sample?n=5").json()) == 2
