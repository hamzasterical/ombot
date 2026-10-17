"""Human-in-the-loop gate for the Layer 2 agent (in-memory, single process, like app/sse.py).

In supervised mode the agent loop stops before every tool call and waits here for the reviewer to
approve, reject (with a note the model sees) or edit the call, or to abort the run.

Modes: "all" pauses on every call, "risky" only on calls that write (draft_reply, freeze_payment,
issue_refund), "auto" never pauses. The reviewer can change the mode at any time.
"""

import asyncio
from dataclasses import dataclass, field
from typing import Any, Literal

from app.config import settings

Mode = Literal["all", "risky", "auto"]
Verdict = Literal["approve", "reject", "abort"]
RISKY_TOOLS = {"draft_reply", "freeze_payment", "issue_refund"}


class ReviewError(Exception):
    """The review request does not match what the agent is waiting on."""


class RunAborted(Exception):
    """The reviewer stopped the run; the case goes back to a human."""


@dataclass
class Review:
    verdict: Verdict
    note: str | None = None
    args: dict[str, Any] | None = None  # edited arguments, if the reviewer changed them


@dataclass
class _Gate:
    mode: Mode
    pending: dict | None = None
    future: asyncio.Future | None = field(default=None, repr=False)


_gates: dict[int, _Gate] = {}


def open_gate(case_id: int, mode: Mode) -> None:
    _gates[case_id] = _Gate(mode=mode)


def close_gate(case_id: int) -> None:
    _gates.pop(case_id, None)


def needs_review(case_id: int, tool: str) -> bool:
    gate = _gates.get(case_id)
    if gate is None or gate.mode == "auto":
        return False
    return gate.mode == "all" or tool in RISKY_TOOLS


async def wait_for_review(case_id: int, call_no: int, tool: str, args: dict) -> Review:
    """Park the agent on one proposed call until the reviewer answers (or the idle timeout hits)."""
    gate = _gates[case_id]
    gate.pending = {"call_no": call_no, "tool": tool, "args": args}
    gate.future = asyncio.get_running_loop().create_future()
    try:
        return await asyncio.wait_for(gate.future, timeout=settings.agent_review_timeout_seconds)
    finally:
        gate.pending = None
        gate.future = None


def pending(case_id: int) -> dict | None:
    gate = _gates.get(case_id)
    return gate.pending if gate else None


def mode(case_id: int) -> Mode | None:
    gate = _gates.get(case_id)
    return gate.mode if gate else None


def submit(case_id: int, call_no: int | None, review: Review | None, new_mode: Mode | None) -> None:
    """Apply a reviewer action: optionally switch mode, optionally answer the pending call."""
    gate = _gates.get(case_id)
    if gate is None:
        raise ReviewError("no supervised agent run is active for this case")
    if new_mode:
        gate.mode = new_mode
    if review is None:
        # Loosening the mode releases a call that no longer needs a review
        pending_call = gate.pending
        if new_mode and pending_call and gate.future and not gate.future.done():
            if not needs_review(case_id, pending_call["tool"]):
                gate.future.set_result(Review("approve"))
        return
    if gate.pending is None or gate.future is None or gate.future.done():
        raise ReviewError("the agent is not waiting for a review")
    if call_no != gate.pending["call_no"]:
        raise ReviewError(f"the agent is waiting on step {gate.pending['call_no']}, not {call_no}")
    gate.future.set_result(review)
