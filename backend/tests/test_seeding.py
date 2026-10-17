"""The demo dataset must back every complaint: the evidence the report sees is the right evidence."""

import json
from datetime import UTC, datetime

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.models import Complaint, Customer, Transaction
from app.report import gather_evidence, mentioned_amounts
from app.seeding import LABELED, LABELED_SCENARIOS, PRESETS, build

NOW = datetime(2026, 10, 15, 14, 30, tzinfo=UTC)  # a Thursday afternoon
LABELS = json.loads(LABELED.read_text(encoding="utf-8"))
PRESET_TEXTS = {  # ombot_frontend/src/pages/SubmitComplaint.tsx
    "CUST-88102": "charged $3,200 to an offshore gaming site in Malta",
    "CUST-49120": "My $85.50 payment at the train station ticket machine failed",
    "CUST-31092": "Why was I charged a $2.50 fee at the grocery store ATM yesterday?",
    "CUST-77401": "auto-transferred $120 into a savings vault without my consent",
}


@pytest.fixture(scope="module")
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        summary = build(s, now=NOW)
        yield s, summary


@pytest.fixture(autouse=True)
def frozen_now(monkeypatch):
    """The tools filter by "last N days" from the real clock; pin it to the seed time."""
    import app.tools.local_tools as lt

    class _DT(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW

    monkeypatch.setattr(lt, "datetime", _DT)


def complaint_customer(s: Session, i: int) -> str:
    return s.exec(select(Complaint).where(Complaint.text == LABELS[i]["text"])).one().customer_id


def evidence_for(s: Session, i: int) -> dict:
    return gather_evidence(s, complaint_customer(s, i), LABELS[i]["text"])


def test_every_complaint_has_its_own_customer(db):
    s, _ = db
    customers = [complaint_customer(s, i) for i in range(len(LABELS))]
    assert customers == [f"CUST-1{i + 1:04d}" for i in range(len(LABELS))]
    assert all(s.get(Customer, c) for c in customers)


def test_quoted_amounts_resolve_to_that_transaction(db):
    s, _ = db
    checked = 0
    for i, item in enumerate(LABELS):
        if not mentioned_amounts(item["text"]):
            continue
        ev = evidence_for(s, i)
        assert ev["transaction"]["amount"] in mentioned_amounts(item["text"]), item["text"]
        assert ev["transaction_note"].startswith("Matched by the amount"), item["text"]
        checked += 1
    assert checked >= 6


def test_presets_resolve_to_the_described_transaction(db):
    s, _ = db
    for cid, text in PRESET_TEXTS.items():
        ev = gather_evidence(s, cid, text)
        assert ev["transaction"]["amount"] in mentioned_amounts(text), cid


@pytest.mark.parametrize("i", [i for i, x in enumerate(LABELS) if x["true_category"] == "failed_payment_money_deducted"])
def test_failed_payments_show_a_failed_debit(db, i):
    txn = evidence_for(db[0], i)["transaction"]
    assert txn["status"] == "failed" and "debit" in txn["failure_reason"]


@pytest.mark.parametrize("i", [30, 31, 32, 33, 34, 62])
def test_delayed_transfers_show_a_pending_transfer_with_reason(db, i):
    txn = evidence_for(db[0], i)["transaction"]
    assert txn["status"] == "pending" and txn["failure_reason"]


def test_incoming_deposit_shows_as_received_pending(db):
    received = evidence_for(db[0], 35)["customer_history"]["received_transactions"]
    assert received[0]["status"] == "pending" and received[0]["amount"] == 2150


@pytest.mark.parametrize("i", [36, 39, 63])
def test_duplicate_charges_are_the_two_latest(db, i):
    a, b = evidence_for(db[0], i)["customer_history"]["transactions"][:2]
    assert a["amount"] == b["amount"] and a["merchant_id"] == b["merchant_id"]


@pytest.mark.parametrize("i", [i for i, x in enumerate(LABELS) if x["true_category"] == "unauthorized_transaction"])
def test_unauthorized_transactions_look_anomalous(db, i):
    s = db[0]
    ev = evidence_for(s, i)
    txn, profile = ev["transaction"], ev["customer_history"]["customer"]
    foreign_device = txn["device_id"] not in ("", profile["primary_device_id"])
    away = profile["city"] not in txn["location"]
    assert foreign_device or away, LABELS[i]["text"]


@pytest.mark.parametrize("i", [i for i, x in enumerate(LABELS) if x["true_category"] == "account_takeover"])
def test_takeovers_have_security_evidence(db, i):
    kinds = {e["event_type"] for e in evidence_for(db[0], i)["security_events"]}
    assert kinds & {"login_new_device", "device_enrolled", "sim_swap", "password_changed", "email_changed"}


@pytest.mark.parametrize("i", [i for i, x in enumerate(LABELS) if x["true_category"] == "lost_or_stolen_device"])
def test_lost_devices_show_last_known_activity(db, i):
    ev = evidence_for(db[0], i)
    assert ev.get("security_events") or ev["transaction"]["created_at"] > "2026-10-13"


@pytest.mark.parametrize(("i", "wrong", "intended"), [(18, "ACC-58241", "ACC-58214"), (23, "ACC-63167", "ACC-63107"),
                                                     (19, "ACC-40002", "ACC-40001")])
def test_wrong_recipient_evidence_shows_the_usual_payee(db, i, wrong, intended):
    ev = evidence_for(db[0], i)
    assert ev["transaction"]["receiver_account"] == wrong
    payees = {p["account"]: p for p in ev["payees"]}
    assert payees[wrong]["payments"] == 1 and payees[intended]["payments"] >= 2


def test_scenario_transaction_is_latest_when_no_amount_is_quoted(db):
    """Routine history stops before each scenario, so the latest transaction is the one complained about."""
    s, summary = db
    scenario_ids = {d["customer_id"]: set(d["scenario_txn_ids"]) for d in summary.demo}
    checked = 0
    for i in LABELED_SCENARIOS:
        cid = complaint_customer(s, i)
        ev = evidence_for(s, i)
        if not scenario_ids[cid] or "transaction" not in ev or i == 35:  # 35: the scenario is an incoming transfer
            continue
        assert ev["transaction"]["id"] in scenario_ids[cid], (i, LABELS[i]["text"], ev["transaction"])
        checked += 1
    assert checked >= 40


def test_contact_details_can_never_reach_real_people(db):
    s = db[0]
    for c in s.exec(select(Customer)).all():
        assert not c.email or c.email.endswith("@example.com")
        assert not c.phone or c.phone.startswith("+1-555-01")


def test_ids_fit_the_formats_the_app_parses(db):
    s, summary = db
    assert summary.counts["transaction"] < 10_000  # report.TXN_ID matches T + 4 digits
    assert all(t.id.startswith("T") and len(t.id) == 5 for t in s.exec(select(Transaction)).all())
    assert set(PRESETS) <= {c.id for c in s.exec(select(Customer)).all()}


def test_build_is_deterministic():
    def fingerprint():
        engine = create_engine("sqlite://", poolclass=StaticPool)
        SQLModel.metadata.create_all(engine)
        with Session(engine) as s:
            build(s, now=NOW)
            return [(t.id, t.amount, t.sender_account) for t in s.exec(select(Transaction).order_by(Transaction.id)).all()]

    assert fingerprint() == fingerprint()
