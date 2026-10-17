"""Sealed test-set evaluation (ARCHITECTURE.md section 10).

Runs the labeled complaints through classify + deterministic routing against a throwaway
in-memory DB, so the live database is never touched. The eval starts from the seed registry
and no learning examples, so the baseline is reproducible.

Learning effect is measured honestly on held-out data: failures on the even-indexed half are
taught (as a human would via map_category), then the odd-indexed half is re-run and compared
with its own baseline.
"""

import asyncio
import json
from dataclasses import dataclass, field
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app import routing
from app.classify import classify
from app.config import settings
from app.metrics import cost_saving_pct
from app.models import Case, Category, Complaint, LearningExample
from app.schemas import EvalResultOut

LABELED = Path(__file__).resolve().parents[1] / "seed" / "complaints_labeled.json"


class EvalConfigError(Exception):
    """Eval cannot run (no model configured, or registry not seeded)."""


@dataclass
class Prediction:
    item: dict
    tier: str
    categories: list[str] = field(default_factory=list)

    @property
    def correct(self) -> bool:
        """Routed exactly right: out-of-list goes to a human; in-list gets category and tier right."""
        if self.item["true_category"] == "none":
            return self.tier != "low"
        return self.item["true_category"] in self.categories and self.tier == self.item["true_tier"]


def _ratio(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


def _eval_session(main: Session) -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    seed = main.exec(select(Category).where(Category.source == "seed")).all()
    if not seed:
        raise EvalConfigError("category registry is empty; run seed/make_synthetic_data.py first")
    for c in seed:
        session.add(Category(**c.model_dump()))
    session.commit()
    return session


async def _predict_all(session: Session, items: list[dict]) -> list[Prediction]:
    sem = asyncio.Semaphore(max(1, settings.llm_max_concurrency))

    async def one(item: dict) -> Prediction:
        async with sem:
            complaint = Complaint(text=item["text"])
            session.add(complaint)
            session.commit()
            case = Case(complaint_id=complaint.id)
            session.add(case)
            session.commit()
            cls = await classify(session, case.id, item["text"], use_fallback=False)  # measure the LLM itself
            return Prediction(
                item,
                routing.determine_tier(session, cls, item["text"]),
                [m.category_id for m in routing.usable_matches(cls)],
            )

    return list(await asyncio.gather(*(one(i) for i in items)))


def _metrics(preds: list[Prediction], session: Session) -> list[EvalResultOut]:
    critical = [p for p in preds if p.item["true_tier"] == "critical"]
    in_list = [p for p in preds if p.item["true_category"] != "none"]
    out_list = [p for p in preds if p.item["kind"] == "out_of_list"]
    low = [p for p in preds if p.item["true_tier"] == "low"]
    n = len(preds)

    reached = sum(p.tier == "critical" for p in critical)
    cat_ok = sum(p.item["true_category"] in p.categories for p in in_list)
    to_human = sum(p.tier != "low" for p in out_list)
    as_unknown = sum(p.tier == "unknown" for p in out_list)
    pushed_up = sum(p.tier != "low" for p in low)
    cheap = sum(p.tier == "low" for p in preds)

    return [
        EvalResultOut(
            metric_name="critical_recall",
            value=_ratio(reached, len(critical)),
            details={"critical": len(critical), "reached_critical": reached, "target": 1.0},
        ),
        EvalResultOut(
            metric_name="category_accuracy",
            value=_ratio(cat_ok, len(in_list)),
            details={"in_list": len(in_list), "correct": cat_ok},
        ),
        EvalResultOut(
            metric_name="unknown_routing_rate",
            value=_ratio(to_human, len(out_list)),
            details={"out_of_list": len(out_list), "sent_to_human": to_human, "exactly_unknown": as_unknown},
        ),
        EvalResultOut(
            metric_name="cost_saving_pct",
            value=cost_saving_pct(session),
            details={"note": "measured classifier tokens at the cheap-model price vs the strong-model price"},
        ),
        EvalResultOut(
            metric_name="cheap_model_share",
            value=_ratio(cheap, n),
            details={"handled_by_cheap_model_only": cheap, "total": n},
        ),
        EvalResultOut(
            metric_name="over_escalation_rate",
            value=_ratio(pushed_up, len(low)),
            details={"true_low": len(low), "pushed_up": pushed_up},
        ),
    ]


async def evaluate(main_session: Session) -> list[EvalResultOut]:
    if not settings.classifier_model:
        raise EvalConfigError("CLASSIFIER_MODEL is not configured (see .env.example)")
    items = json.loads(LABELED.read_text(encoding="utf-8"))
    session = _eval_session(main_session)
    try:
        baseline = await _predict_all(session, items)
        results = _metrics(baseline, session)

        # Learning effect on held-out data.
        train = {i for i in range(len(items)) if i % 2 == 0}
        held_idx = [i for i in range(len(items)) if i not in train]
        taught = 0
        for i in train:
            p = baseline[i]
            if p.item["true_category"] != "none" and not p.correct:
                session.add(LearningExample(complaint_text=p.item["text"], human_category_id=p.item["true_category"]))
                taught += 1
        session.commit()
        before = sum(not baseline[i].correct for i in held_idx)
        after_preds = await _predict_all(session, [items[i] for i in held_idx])
        after = sum(not p.correct for p in after_preds)
        results.append(
            EvalResultOut(
                metric_name="learning_effect",
                value=float(before - after),
                details={
                    "held_out": len(held_idx),
                    "misroutes_before": before,
                    "misroutes_after": after,
                    "examples_taught": taught,
                    "note": "misroutes fixed on held-out complaints after teaching from the other half",
                },
            )
        )
        results.append(
            EvalResultOut(
                metric_name="failures",
                value=float(sum(not p.correct for p in baseline)),
                details={
                    "items": [
                        {
                            "text": p.item["text"],
                            "expected": [p.item["true_category"], p.item["true_tier"]],
                            "got": [p.categories, p.tier],
                        }
                        for p in baseline
                        if not p.correct
                    ]
                },
            )
        )
        return results
    finally:
        session.close()
