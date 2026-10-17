from types import SimpleNamespace

import pytest

from app import llm
from app.config import settings
from app.schemas import ClassificationResult

GOOD = '{"categories": [{"category_id": "x", "confidence": 0.9, "supporting_quote": "q"}], "raw_category": null}'


def reply(content, usage=(3, 2)):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=None))],
        usage=SimpleNamespace(prompt_tokens=usage[0], completion_tokens=usage[1]),
    )


class FakeClient:
    """Plays back scripted outcomes (a reply, or an exception to raise) and records the requests."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.requests = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.requests.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def fake(monkeypatch):
    def install(*outcomes):
        client = FakeClient(outcomes)
        monkeypatch.setattr(llm, "get_client", lambda model: client)
        return client

    return install


def test_one_key_and_url_serve_both_models(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "sk-one")
    for model in ("google/gemma-4-31b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free"):
        client = llm.get_client(model)
        assert client.api_key == "sk-one" and "openrouter.ai" in str(client.base_url)


@pytest.mark.parametrize(
    "text",
    [GOOD, f"```json\n{GOOD}\n```", f"<think>hmm {{not json}}</think>\n{GOOD}", f"Sure! Here you go: {GOOD} Hope it helps."],
)
def test_extract_json_tolerates_model_chatter(text):
    assert ClassificationResult.model_validate(llm.extract_json(text)).categories[0].category_id == "x"


def test_extract_json_rejects_prose():
    with pytest.raises(ValueError):
        llm.extract_json("I cannot help with that.")


async def test_structured_happy_path_uses_json_mode(fake):
    client = fake(reply(GOOD))
    result = await llm.structured("m", "sys", "user text", ClassificationResult)
    assert result.parsed.categories[0].category_id == "x" and result.usage == {"prompt_tokens": 3, "completion_tokens": 2}
    req = client.requests[0]
    assert req["response_format"] == {"type": "json_object"} and req["messages"][0]["role"] == "system"


async def test_api_error_retries_in_compat_mode_for_free_models(fake):
    client = fake(RuntimeError("Developer instruction is not enabled"), reply(f"```json\n{GOOD}\n```"))
    result = await llm.structured("m", "sys", "user text", ClassificationResult)
    assert result.parsed is not None
    compat = client.requests[1]
    assert "response_format" not in compat
    assert [m["role"] for m in compat["messages"]] == ["user"]
    assert "sys" in compat["messages"][0]["content"] and "user text" in compat["messages"][0]["content"]


async def test_invalid_output_is_retried_once_then_gives_up(fake):
    client = fake(reply("no json here"), reply("still prose"))
    result = await llm.structured("m", "s", "u", ClassificationResult)
    assert result.parsed is None and "invalid output" in result.error and len(client.requests) == 2


async def test_persistent_api_failure_never_raises(fake):
    fake(RuntimeError("401"), RuntimeError("401"), RuntimeError("401"))
    result = await llm.structured("m", "s", "u", ClassificationResult)
    assert result.parsed is None and "RuntimeError" in result.error


async def test_chat_with_tools_parses_calls_and_strips_reasoning(fake):
    call = SimpleNamespace(id="c1", function=SimpleNamespace(name="get_transaction", arguments='{"txn_id": "T1"}'))
    resp = reply("<think>plan</think>checking")
    resp.choices[0].message.tool_calls = [call]
    fake(resp)
    turn = await llm.chat_with_tools("m", [], [])
    assert turn.content == "checking"
    assert [(c.name, c.arguments) for c in turn.tool_calls] == [("get_transaction", {"txn_id": "T1"})]
    assert turn.message["tool_calls"][0]["function"]["name"] == "get_transaction"


async def test_response_without_choices_is_a_clear_error_not_a_typeerror(fake):
    empty = SimpleNamespace(choices=None, usage=None, error={"message": "upstream down", "code": 502})
    fake(empty, empty, empty)
    result = await llm.structured("m", "s", "u", ClassificationResult)
    assert result.parsed is None and "no choices" in result.error and "upstream down" in result.error
    fake(empty)
    with pytest.raises(llm.EmptyResponseError, match="upstream down"):
        await llm.chat_with_tools("m", [], [])
