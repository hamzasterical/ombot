"""Run the sealed test set and print the headline numbers.

Run from backend/:  uv run python eval/run_eval.py
Needs the DB seeded (seed/make_synthetic_data.py) and the LLM configured in .env.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session

from app.db import engine
from app.evaluation import EvalConfigError, evaluate

TARGETS = {"critical_recall": "target 100%"}


def fmt(value: float | None, name: str) -> str:
    if value is None:
        return "n/a"
    if name in ("learning_effect", "failures"):
        return f"{value:+.0f}" if name == "learning_effect" else f"{value:.0f}"
    if name == "cost_saving_pct":
        return f"{value:.1f}%"
    return f"{value * 100:.1f}%"


def main() -> int:
    try:
        with Session(engine) as session:
            results = asyncio.run(evaluate(session))
    except EvalConfigError as e:
        print(f"Cannot run eval: {e}", file=sys.stderr)
        return 2

    print(f"{'metric':<24}{'value':>10}  details")
    for r in results:
        if r.metric_name == "failures":
            continue
        details = {k: v for k, v in r.details.items() if k != "note"}
        extra = f"  ({TARGETS[r.metric_name]})" if r.metric_name in TARGETS else ""
        print(f"{r.metric_name:<24}{fmt(r.value, r.metric_name):>10}  {details}{extra}")

    failures = next(r for r in results if r.metric_name == "failures")
    print(f"\n{int(failures.value)} misrouted (baseline):")
    for f in failures.details["items"]:
        print(f"  - {f['text'][:70]!r}\n      expected {f['expected']}, got {f['got']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
