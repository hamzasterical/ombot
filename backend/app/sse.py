"""Per-case event bus for the live agent/tool-call trace (in-memory, single process).

Late subscribers get the history replayed first, so a client that connects after the
POST returns still sees every step. The stream ends after a terminal event.
"""

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any

EVENT_TYPES = {
    "classify",
    "evidence_fetch",
    "report_generated",
    "tool_call",
    "agent_step",
    "step_proposed",
    "step_reviewed",
    "agent_done",
    "decision",
    "error",
}
TERMINAL = {"agent_done", "error"}
MAX_HISTORY = 200

_history: dict[int, list[dict]] = defaultdict(list)
_subscribers: dict[int, set[asyncio.Queue]] = defaultdict(set)


def emit(case_id: int, event: str, data: dict[str, Any] | None = None) -> None:
    assert event in EVENT_TYPES, f"unknown SSE event type: {event}"
    item = {"event": event, "data": data or {}}
    history = _history[case_id]
    history.append(item)
    del history[:-MAX_HISTORY]
    for q in _subscribers[case_id]:
        q.put_nowait(item)


async def subscribe(case_id: int) -> AsyncIterator[dict]:
    q: asyncio.Queue = asyncio.Queue()
    for item in _history[case_id]:
        q.put_nowait(item)
    _subscribers[case_id].add(q)
    try:
        while True:
            item = await q.get()
            yield item
            if item["event"] in TERMINAL:
                return
    finally:
        _subscribers[case_id].discard(q)


def reset() -> None:
    """Test helper."""
    _history.clear()
    _subscribers.clear()
