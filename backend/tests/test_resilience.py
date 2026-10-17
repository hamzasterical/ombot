"""Rate limits and slow models: circuit breaker, background intake, per-turn agent timeout, restart recovery."""

import asyncio

import httpx
import openai
import pytest
from sqlmodel import select

from app import llm, pipeline, report
from app.agents import moderate_agent
from app.config import settings
from app.models import Case, Complaint, Decision
from app.schemas import ClassificationResult, ReportResult
from tests.test_phase5 import FINAL, agent_case, money, turn  # noqa: F401  (money: fixture)


def rate_limit_error():
    resp = httpx.Response(429, request=httpx.Request("POST", "http://llm.test"))
    return openai.RateLimitError("slow down", response=resp, body=None)


class FakeClient:
    def __init__(self, error):
        self.calls = 0
        self.error = error
        self.chat = self
        self.completions = self

    async def create(self, **kwargs):
        self.calls += 1
        raise self.error


def acts(session, case_id):
    rows = session.exec(select(Decision).where(Decision.case_id == case_id).order_by(Decision.id))  # type: ignore[arg-type]
    return [d.action for d in rows]


# ---- circuit breaker ---------------------------------------------------------


async def test_breaker_opens_after_repeated_rate_limits_and_skips_calls(monkeypatch):
    fake = FakeClient(rate_limit_error())
    monkeypatch.setattr(llm, "get_client", lambda model: fake)

    for _ in range(settings.llm_breaker_threshold):
        result = await llm.structured("m", "s", "u", ReportResult)
        assert result.parsed is None
    # one request per call: a rate limit is not retried in compatibility mode
    assert fake.calls == settings.llm_breaker_threshold
    assert llm.breaker_retry_in() > 0

    result = await llm.structured("m", "s", "u", ReportResult)
    assert result.parsed is None and result.error.startswith("LLM unavailable")
    assert fake.calls == settings.llm_breaker_threshold  # the open breaker made no request

    with pytest.raises(llm.LLMUnavailable):
        await llm.chat_with_tools("m", [], [])


async def test_other_errors_do_not_trip_the_breaker(monkeypatch):
    fake = FakeClient(RuntimeError("boom"))
    monkeypatch.setattr(llm, "get_client", lambda model: fake)
    for _ in range(5):
        await llm.structured("m", "s", "u", ReportResult)
    assert llm.breaker_retry_in() == 0


async def test_breaker_closes_after_cooldown(monkeypatch):
    monkeypatch.setattr(settings, "llm_breaker_cooldown_seconds", 0)
    fake = FakeClient(rate_limit_error())
    monkeypatch.setattr(llm, "get_client", lambda model: fake)
    for _ in range(settings.llm_breaker_threshold):
        await llm.structured("m", "s", "u", ReportResult)
    assert llm.breaker_retry_in() == 0  # zero-second cooldown: the next call goes through
    await llm.structured("m", "s", "u", ReportResult)
    assert fake.calls == settings.llm_breaker_threshold + 1


async def test_report_says_llm_unavailable(session, case, monkeypatch):
    async def unavailable(*a, **k):
        return llm.LLMResult(None, "m", error="LLM unavailable: the provider is rate-limiting requests")

    monkeypatch.setattr(llm, "structured", unavailable)
    assert await report.generate(session, case, "x", ClassificationResult(), {}) is None
    assert case.status == "awaiting_human"
    assert "LLM unavailable" in case.report["summary"] and case.report["llm_unavailable"] is True


# ---- background intake -------------------------------------------------------


async def test_pipeline_crash_hands_the_case_to_a_human(session, monkeypatch):
    monkeypatch.setattr(pipeline, "engine", session.get_bind())

    async def boom(*a, **k):
        raise RuntimeError("db exploded")

    monkeypatch.setattr(pipeline, "classify", boom)
    case = pipeline.create_case(session, "help", None)
    assert case.status == "processing"
    await pipeline.process_in_background(case.id)

    session.expire_all()
    case = session.get(Case, case.id)
    assert (case.status, case.tier, case.assigned_layer) == ("awaiting_human", "unknown", 1)
    assert "pipeline_failed" in acts(session, case.id)


def test_restart_sends_interrupted_cases_to_a_human(session):
    ids = []
    for status in ("processing", "agent_running", "awaiting_human"):
        complaint = Complaint(text="x")
        session.add(complaint)
        session.commit()
        c = Case(complaint_id=complaint.id, status=status, tier="moderate" if status != "processing" else None)
        session.add(c)
        session.commit()
        ids.append(c.id)

    assert pipeline.recover_interrupted(session) == 2
    statuses = [session.get(Case, i).status for i in ids]
    assert statuses == ["awaiting_human"] * 3
    assert session.get(Case, ids[0]).tier == "unknown"
    assert "recovered" in acts(session, ids[0]) and "recovered" not in acts(session, ids[2])


# ---- agent timeout is per turn -----------------------------------------------


def slow_script(monkeypatch, turns, delay):
    it = iter(turns)

    async def fake(model, messages, tools):
        await asyncio.sleep(delay)
        return next(it)

    monkeypatch.setattr(llm, "chat_with_tools", fake)


async def test_slow_but_progressing_agent_is_not_killed(session, case, money, monkeypatch):
    agent_case(session, case)
    monkeypatch.setattr(settings, "agent_timeout_seconds", 0.2)  # each turn is well under; the run is well over
    calls = [("get_transaction", {"txn_id": "T0001"})]
    slow_script(monkeypatch, [turn(calls=calls), turn(calls=calls), turn(calls=calls), turn(FINAL)], delay=0.1)
    await moderate_agent.run_agent(case.id, session)
    assert case.status == "resolved"


async def test_one_stuck_turn_hands_the_case_to_a_human(session, case, money, monkeypatch):
    agent_case(session, case)
    monkeypatch.setattr(settings, "agent_timeout_seconds", 0.05)
    slow_script(monkeypatch, [turn(FINAL)], delay=0.5)
    await moderate_agent.run_agent(case.id, session)
    assert case.status == "awaiting_human"
    failed = session.exec(select(Decision).where(Decision.action == "agent_failed")).one()
    assert "within" in failed.payload["error"] and "step 1" in failed.payload["error"]
