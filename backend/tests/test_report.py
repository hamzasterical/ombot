from sqlmodel import Session

from app import llm, report
from app.models import Account, Customer, Transaction
from app.schemas import CategoryMatch, ClassificationResult, ReportResult
from app.tools import local_tools as tools


def seed_customer(session: Session):
    session.add(Customer(id="C1", name="Test"))
    session.add(Account(id="A1", customer_id="C1", balance=100))
    session.add(Account(id="A2", customer_id="C1", balance=5))
    session.add(Transaction(id="T0001", sender_account="A1", receiver_account="A2", amount=9))
    session.commit()


def test_tools(session):
    seed_customer(session)
    assert tools.get_transaction(session, "T0001")["amount"] == 9
    assert tools.get_transaction(session, "nope") == tools.NOT_FOUND
    assert tools.get_sender(session, "A1")["customer"]["name"] == "Test"
    assert len(tools.get_customer_history(session, "C1")["transactions"]) == 1
    assert tools.get_policy("../../config") is None
    assert tools.search_policy("stolen phone card")[0]["policy_id"] == "policy_lost_stolen_device"


def test_gather_evidence_uses_mentioned_txn(session):
    seed_customer(session)
    ev = report.gather_evidence(session, "C1", "please check T0001")
    assert ev["transaction"]["id"] == "T0001" and "transaction_note" not in ev
    assert "receiver" in ev
    assert report.gather_evidence(session, None, "x") == {}


async def test_generate_stores_db_evidence_and_logs(session, case, monkeypatch):
    async def fake(*a, **k):
        return llm.LLMResult(
            ReportResult(summary="s", category="c", recommended_next_step="n", evidence={"made": "up"}),
            "m",
        )

    monkeypatch.setattr(llm, "structured", fake)
    cls = ClassificationResult(
        categories=[CategoryMatch(category_id="app_or_login_issue", confidence=0.9, supporting_quote="q")]
    )
    out = await report.generate(session, case, "app broken", cls, {"real": 1})
    assert out.evidence == {"real": 1} and case.report["evidence"] == {"real": 1}


async def test_generate_failure_marks_human(session, case, monkeypatch):
    async def fake(*a, **k):
        return llm.LLMResult(None, "m", error="bad")

    monkeypatch.setattr(llm, "structured", fake)
    assert await report.generate(session, case, "x", ClassificationResult(), {}) is None
    assert case.status == "awaiting_human" and case.report["error"] == "bad"


async def test_generate_backfills_fields_a_free_model_omitted(session, case, monkeypatch):
    async def fake(*a, **k):
        return llm.LLMResult(ReportResult.model_validate({"summary": "s"}), "m")

    monkeypatch.setattr(llm, "structured", fake)
    cls = ClassificationResult(
        categories=[CategoryMatch(category_id="fees_and_charges_question", confidence=0.9, supporting_quote="q")]
    )
    out = await report.generate(session, case, "why this fee", cls, {})
    assert out.category == "fees_and_charges_question" and out.recommended_next_step
