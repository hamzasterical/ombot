"""A rate-limited API key hands the same request to a backup key; with one key nothing changes."""

import time

import httpx
import openai
import pytest

from app import llm
from app.config import settings
from app.schemas import ReportResult

GOOD = '{"summary": "s", "category": "c", "recommended_next_step": "n"}'


def rate_limit_error(reset_ms=None):
    resp = httpx.Response(429, request=httpx.Request("POST", "http://llm.test"))
    body = {"message": "free-models-per-day", "code": 429}
    if reset_ms is not None:
        body["metadata"] = {"headers": {"X-RateLimit-Reset": str(reset_ms)}}
    return openai.RateLimitError("slow down", response=resp, body=body)


class _Msg:
    def __init__(self, content):
        self.content, self.tool_calls = content, None


class _Resp:
    usage = None

    def __init__(self, content):
        self.choices = [type("C", (), {"message": _Msg(content)})()]


class KeyedClient:
    """Fails with a rate limit for exhausted keys, answers for the rest; records which key each call used."""

    def __init__(self, exhausted, reset_ms=None):
        self.exhausted, self.reset_ms, self.used = set(exhausted), reset_ms, []
        self.chat = self.completions = self

    async def create(self, **kwargs):
        key = llm.active_key()
        self.used.append(key)
        if key in self.exhausted:
            raise rate_limit_error(self.reset_ms)
        return _Resp(GOOD)


@pytest.fixture
def keys(monkeypatch):
    def install(primary, backups, exhausted, reset_ms=None):
        monkeypatch.setattr(settings, "llm_api_key", primary)
        monkeypatch.setattr(settings, "llm_backup_api_keys", backups)
        client = KeyedClient(exhausted, reset_ms)
        monkeypatch.setattr(llm, "get_client", lambda model: client)
        return client

    return install


def test_key_list_dedupes_and_ignores_blanks(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "sk-a")
    monkeypatch.setattr(settings, "llm_backup_api_keys", " sk-b , ,sk-a,sk-c ")
    assert llm.api_keys() == ["sk-a", "sk-b", "sk-c"]


async def test_rate_limited_key_fails_over_to_backup(keys):
    client = keys("sk-a", "sk-b", exhausted={"sk-a"})
    result = await llm.structured("m", "s", "u", ReportResult)
    assert result.parsed is not None and client.used == ["sk-a", "sk-b"]
    assert llm.breaker_retry_in() == 0  # a successful failover never counts toward the breaker
    await llm.structured("m", "s", "u", ReportResult)
    assert client.used[-1] == "sk-b"  # stays on the working key


async def test_skips_cooling_keys_and_breaker_opens_only_when_all_are_exhausted(keys):
    client = keys("sk-a", "sk-b,sk-c", exhausted={"sk-a", "sk-b", "sk-c"})
    for _ in range(settings.llm_breaker_threshold):
        assert (await llm.structured("m", "s", "u", ReportResult)).parsed is None
    # first call tries every key once in priority order; with all cooling, later calls use the one that frees first
    assert client.used[:3] == ["sk-a", "sk-b", "sk-c"]
    assert client.used[3:] == ["sk-a"] * (settings.llm_breaker_threshold - 1)
    assert llm.breaker_retry_in() > 0


async def test_priority_order_and_return_to_primary(keys):
    client = keys("sk-1", "sk-2,sk-3", exhausted={"sk-1", "sk-2"})
    await llm.structured("m", "s", "u", ReportResult)
    assert client.used == ["sk-1", "sk-2", "sk-3"]  # 1 -> 2 -> 3, never skipping ahead
    await llm.structured("m", "s", "u", ReportResult)
    assert client.used[-1] == "sk-3"  # 1 and 2 still cooling
    llm._keys["cooling_until"][1] = 0.0  # key #2 resets first
    client.exhausted = {"sk-1"}
    await llm.structured("m", "s", "u", ReportResult)
    assert client.used[-1] == "sk-2"  # back up to the best free key
    llm._keys["cooling_until"][0] = 0.0  # key #1 resets
    client.exhausted = set()
    await llm.structured("m", "s", "u", ReportResult)
    assert client.used[-1] == "sk-1"  # primary again


async def test_cooled_key_comes_back_after_reset(keys, monkeypatch):
    client = keys("sk-a", "sk-b", exhausted={"sk-a"}, reset_ms=int(time.time() * 1000) + 3_600_000)
    await llm.structured("m", "s", "u", ReportResult)
    assert llm._keys["cooling_until"][0] - time.monotonic() > 3000  # honours the provider's reset time
    llm._keys["cooling_until"][0] = 0.0  # window over
    client.exhausted = {"sk-b"}
    await llm.structured("m", "s", "u", ReportResult)
    assert client.used[-2:] == ["sk-b", "sk-a"]


async def test_agent_turn_fails_over_too(keys):
    client = keys("sk-a", "sk-b", exhausted={"sk-a"})
    turn = await llm.chat_with_tools("m", [{"role": "user", "content": "hi"}], [])
    assert turn.content == GOOD and client.used == ["sk-a", "sk-b"]


async def test_single_key_behaviour_is_unchanged(keys):
    client = keys("sk-a", "", exhausted={"sk-a"})
    result = await llm.structured("m", "s", "u", ReportResult)
    assert result.parsed is None and client.used == ["sk-a"]
