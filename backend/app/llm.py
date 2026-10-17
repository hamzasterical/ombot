"""Thin wrapper over the OpenAI SDK pointed at OpenRouter: JSON in, Pydantic-validated model out.

One OpenRouter key and base URL; the model name picks the model:
  - cheap  (Gemma):    classifier, report/summary, low-tier reply
  - strong (Nemotron): the delegated Layer 2 agent (settings.agent_model)
"""

import json
import logging
import re
import time
from dataclasses import dataclass, field

import openai
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import settings

log = logging.getLogger(__name__)

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


@dataclass
class LLMResult[T]:
    parsed: T | None
    model: str
    usage: dict = field(default_factory=dict)
    latency_ms: int = 0
    error: str | None = None


class LLMUnavailable(RuntimeError):
    """The circuit breaker is open: the provider keeps rate-limiting us, so calls are skipped for a while."""


# Circuit breaker (single process, like app/sse.py). Consecutive rate-limit failures open it; any success closes it.
_breaker = {"failures": 0, "open_until": 0.0}


def _is_rate_limit(e: Exception) -> bool:
    return isinstance(e, (openai.RateLimitError, EmptyResponseError))


def breaker_retry_in() -> int:
    """Seconds until LLM calls resume; 0 when the breaker is closed."""
    return max(0, int(_breaker["open_until"] - time.monotonic() + 0.999))


def unavailable_reason() -> str:
    return f"LLM unavailable: the provider is rate-limiting requests; retrying in about {breaker_retry_in()}s"


def _note_failure(e: Exception) -> None:
    if not _is_rate_limit(e):
        return
    _breaker["failures"] += 1
    if _breaker["failures"] >= settings.llm_breaker_threshold:
        _breaker["open_until"] = time.monotonic() + settings.llm_breaker_cooldown_seconds
        _breaker["failures"] = 0
        log.warning("LLM circuit breaker open for %ss after repeated rate limits", settings.llm_breaker_cooldown_seconds)


def _note_success() -> None:
    _breaker["failures"] = 0


def reset_breaker() -> None:
    """Test helper."""
    _breaker.update(failures=0, open_until=0.0)
    _keys.update(active=0, cooling_until={})


# ---- API key failover --------------------------------------------------------
# Keys in priority order: LLM_API_KEY first, then LLM_BACKUP_API_KEYS left to right. Every request uses the
# highest-priority key that is not cooling down, so traffic returns to key #1 as soon as its limit resets.
# A rate-limited key cools down until the provider's reset time (or the breaker cooldown when the provider gives
# none). The breaker only counts a rate limit when no other key is left, so with one key nothing changes.
_keys: dict = {"active": 0, "cooling_until": {}}
_MIN_KEY_COOLDOWN = 60.0  # seconds; keeps two exhausted keys from bouncing the request back and forth


def api_keys() -> list[str]:
    keys = [settings.llm_api_key, *settings.llm_backup_api_keys.split(",")]
    return list(dict.fromkeys(k.strip() for k in keys if k and k.strip()))


def _key_index() -> int:
    """Highest-priority key that is not cooling; if all are, the one whose cooldown ends first."""
    n = len(api_keys())
    if n == 0:
        return 0
    now = time.monotonic()
    cooling = _keys["cooling_until"]
    for i in range(n):
        if cooling.get(i, 0.0) <= now:
            break
    else:
        i = min(range(n), key=lambda j: cooling.get(j, 0.0))
    if i != _keys["active"]:
        log.warning("LLM requests now use key #%s of %s", i + 1, n)
        _keys["active"] = i
    return i


def active_key() -> str:
    keys = api_keys()
    return keys[_key_index()] if keys else ""


def _reset_at(e: Exception) -> float | None:
    """Provider's rate-limit reset time as a time.monotonic() value, if the error says when."""
    raw = None
    body = getattr(e, "body", None)
    if isinstance(body, dict):
        raw = ((body.get("metadata") or {}).get("headers") or {}).get("X-RateLimit-Reset")
    if raw is None and getattr(e, "response", None) is not None:
        raw = e.response.headers.get("x-ratelimit-reset")
    try:
        seconds = float(raw) / 1000 - time.time()  # OpenRouter sends epoch milliseconds
    except (TypeError, ValueError):
        return None
    return time.monotonic() + max(_MIN_KEY_COOLDOWN, seconds)  # a stale reset time must not make it look free


def _switch_key(e: Exception, used: int) -> bool:
    """Cool down key #used after a rate limit. True when another key is free to retry the request on."""
    keys = api_keys()
    if len(keys) < 2 or not isinstance(e, openai.RateLimitError):
        return False
    now = time.monotonic()
    _keys["cooling_until"][used] = _reset_at(e) or now + settings.llm_breaker_cooldown_seconds
    log.warning("LLM key #%s of %s is rate-limited", used + 1, len(keys))
    return any(_keys["cooling_until"].get(i, 0.0) <= now for i in range(len(keys)))


def get_client(model: str) -> AsyncOpenAI:
    headers = {"X-Title": "Ombot"}
    if settings.llm_site_url:
        headers["HTTP-Referer"] = settings.llm_site_url
    return AsyncOpenAI(
        base_url=settings.llm_base_url or None,
        api_key=active_key() or "unset",
        default_headers=headers,
        max_retries=3,  # the SDK backs off on 429/5xx, which free OpenRouter tiers hit often
    )


def extract_json(text: str) -> object:
    """Pull a JSON value out of model output: drops <think> blocks and code fences, tolerates chatter."""
    text = _THINK.sub("", text or "").strip()
    candidates = [text]
    if m := _FENCE.search(text):
        candidates.append(m.group(1).strip())
    if "{" in text and "}" in text:
        candidates.append(text[text.index("{") : text.rindex("}") + 1])
    for c in candidates:
        try:
            return json.loads(c)
        except ValueError:
            continue
    raise ValueError("no JSON object found in model output")


class EmptyResponseError(RuntimeError):
    """OpenRouter answered without choices (provider error, rate limit, or upstream hiccup)."""


def _message(resp):
    """First choice's message, or a readable error when the provider returned an error body instead."""
    if not getattr(resp, "choices", None):
        detail = getattr(resp, "error", None) or (getattr(resp, "model_extra", None) or {}).get("error")
        raise EmptyResponseError(f"response had no choices: {detail or 'no error detail'}")
    return resp.choices[0].message


def _add_usage(usage: dict, resp) -> dict:
    if not getattr(resp, "usage", None):
        return usage
    return {
        "prompt_tokens": usage.get("prompt_tokens", 0) + (resp.usage.prompt_tokens or 0),
        "completion_tokens": usage.get("completion_tokens", 0) + (resp.usage.completion_tokens or 0),
    }


async def structured[T: BaseModel](
    model: str, system: str, user: str, schema: type[T], retries: int = 1
) -> LLMResult[T]:
    """Call the model asking for JSON matching `schema`. Retry once on invalid output.

    Free OpenRouter models differ in what they accept, so if the first request errors we retry once
    in compatibility mode: no response_format, and the system prompt folded into the user message.
    Never raises: on failure returns parsed=None so the caller can route to a human.
    """
    if breaker_retry_in():  # skip the call entirely; the caller routes the case to a human
        return LLMResult(None, model, {}, 0, unavailable_reason())
    system = f"{system}\n\nReply with a single JSON object matching this JSON schema:\n" + json.dumps(
        schema.model_json_schema()
    )
    usage: dict = {}
    error = None
    compat = False
    attempts = retries + 1
    start = time.monotonic()
    while attempts > 0:
        attempts -= 1
        if compat:
            messages = [{"role": "user", "content": f"{system}\n\n---\n\n{user}"}]
            extra: dict = {}
        else:
            messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
            extra = {"response_format": {"type": "json_object"}}
        used = _key_index()
        try:
            resp = await get_client(model).chat.completions.create(model=model, messages=messages, **extra)
            usage = _add_usage(usage, resp)
            content = _message(resp).content or ""
            parsed = schema.model_validate(extract_json(content))
            _note_success()
            return LLMResult(parsed, model, usage, int((time.monotonic() - start) * 1000))
        except ValueError as e:  # includes pydantic ValidationError
            error = f"invalid output: {e}"
        except Exception as e:  # noqa: BLE001  network, auth, rate limit, unsupported params; never raise
            error = f"{type(e).__name__}: {e}"
            log.warning("LLM call failed (%s, compat=%s): %s", model, compat, error)
            if _switch_key(e, used):  # another account's key is free: same request, same mode, no retry spent
                attempts += 1
                continue
            _note_failure(e)
            if _is_rate_limit(e):  # retrying in another mode only spends more of a quota that is already exhausted
                if breaker_retry_in():
                    error = unavailable_reason()
                break
            if not compat:
                compat = True
                attempts += 1  # switching mode does not use up the retry budget
    return LLMResult(None, model, usage, int((time.monotonic() - start) * 1000), error)


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class ChatTurn:
    content: str | None
    tool_calls: list[ToolCall]
    usage: dict
    message: dict  # assistant message, ready to append to the conversation


async def chat_with_tools(model: str, messages: list[dict], tools: list[dict]) -> ChatTurn:
    """One turn of an OpenAI-style tool-calling conversation. Raises on API errors."""
    if breaker_retry_in():
        raise LLMUnavailable(unavailable_reason())
    while True:
        used = _key_index()
        try:
            resp = await get_client(model).chat.completions.create(model=model, messages=messages, tools=tools)
            msg = _message(resp)
            break
        except Exception as e:
            if _switch_key(e, used):  # retry the same turn on the next account's key
                continue
            _note_failure(e)
            raise
    _note_success()
    calls: list[ToolCall] = []
    for tc in msg.tool_calls or []:
        fn = getattr(tc, "function", None)
        if fn is None:
            continue
        try:
            args = json.loads(fn.arguments or "{}")
        except ValueError:
            args = {"_error": "arguments were not valid JSON"}
        calls.append(ToolCall(tc.id, fn.name, args if isinstance(args, dict) else {}))
    content = _THINK.sub("", msg.content).strip() if msg.content else msg.content
    message = {"role": "assistant", "content": content}
    if calls:
        message["tool_calls"] = [
            {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": json.dumps(c.arguments)}}
            for c in calls
        ]
    return ChatTurn(content, calls, _add_usage({}, resp), message)
