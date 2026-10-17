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


def get_client(model: str) -> AsyncOpenAI:
    headers = {"X-Title": "Ombot"}
    if settings.llm_site_url:
        headers["HTTP-Referer"] = settings.llm_site_url
    return AsyncOpenAI(
        base_url=settings.llm_base_url or None,
        api_key=settings.llm_api_key or "unset",
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
        try:
            resp = await get_client(model).chat.completions.create(model=model, messages=messages, **extra)
            usage = _add_usage(usage, resp)
            content = _message(resp).content or ""
            parsed = schema.model_validate(extract_json(content))
            return LLMResult(parsed, model, usage, int((time.monotonic() - start) * 1000))
        except ValueError as e:  # includes pydantic ValidationError
            error = f"invalid output: {e}"
        except Exception as e:  # noqa: BLE001  network, auth, rate limit, unsupported params; never raise
            error = f"{type(e).__name__}: {e}"
            log.warning("LLM call failed (%s, compat=%s): %s", model, compat, error)
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
    resp = await get_client(model).chat.completions.create(model=model, messages=messages, tools=tools)
    msg = _message(resp)
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
