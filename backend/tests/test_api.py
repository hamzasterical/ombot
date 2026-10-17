import pytest

from app import llm
from app.agents import low_reply, moderate_agent
from app.schemas import CategoryMatch, ClassificationResult, ReportResult


@pytest.fixture
def fake_llm(monkeypatch):
    """Classification result is set per test via fake_llm.cls."""

    class Fake:
        cls = ClassificationResult()

    async def structured(model, system, user, schema, **kw):
        if schema is ClassificationResult:
            return llm.LLMResult(Fake.cls, "m", {"prompt_tokens": 10, "completion_tokens": 5})
        return llm.LLMResult(
            ReportResult(summary="s", category="c", recommended_next_step="n"),
            "m",
            {"prompt_tokens": 10, "completion_tokens": 5},
        )

    monkeypatch.setattr(llm, "structured", structured)
    return Fake


def match(cid):
    return ClassificationResult(
        categories=[CategoryMatch(category_id=cid, confidence=0.9, supporting_quote="q")]
    )


def submit(client, text):
    r = client.post("/api/complaints", json={"text": text})
    assert r.status_code == 200, r.text
    return r.json()


def test_submit_routes_by_registry_tier(client, fake_llm):
    fake_llm.cls = match("unauthorized_transaction")
    case = submit(client, "money gone")
    assert (case["tier"], case["status"], case["assigned_layer"]) == ("critical", "awaiting_human", 1)
    assert case["report"]["summary"] == "s"

    fake_llm.cls = ClassificationResult()
    case = submit(client, "weather is nice")
    assert (case["tier"], case["status"]) == ("unknown", "awaiting_human")

    fake_llm.cls = match("app_or_login_issue")
    case = submit(client, "app slow but I didn't make this payment")  # danger floor
    assert case["tier"] == "critical"


def test_low_tier_goes_through_layer3_hook(client, fake_llm, monkeypatch):
    called = []

    async def fake_run(session, case):
        called.append(case.id)
        case.status = "auto_replied"

    monkeypatch.setattr(low_reply, "run", fake_run)
    fake_llm.cls = match("app_or_login_issue")
    case = submit(client, "app crashes")
    assert called == [case["id"]] and case["status"] == "auto_replied"


def test_list_detail_and_audit(client, fake_llm):
    fake_llm.cls = match("wrong_recipient_transfer")
    case = submit(client, "wrong account")
    assert [c["id"] for c in client.get("/api/cases?tier=moderate").json()] == [case["id"]]
    assert client.get("/api/cases?tier=critical").json() == []
    detail = client.get(f"/api/cases/{case['id']}").json()
    assert [d["action"] for d in detail["decisions"]] == ["classify", "route", "generate_report"]
    assert client.get("/api/audit?action=route").json()[0]["payload"]["tier"] == "moderate"
    assert client.get("/api/cases/999").status_code == 404


def test_delegate_only_moderate(client, fake_llm, monkeypatch):
    ran = []

    async def fake_agent(case_id):
        ran.append(case_id)

    monkeypatch.setattr(moderate_agent, "run_agent", fake_agent)
    fake_llm.cls = match("unauthorized_transaction")
    critical = submit(client, "x")
    assert client.post(f"/api/cases/{critical['id']}/delegate").status_code == 409

    fake_llm.cls = match("wrong_recipient_transfer")
    moderate = submit(client, "y")
    r = client.post(f"/api/cases/{moderate['id']}/delegate")
    assert r.status_code == 200 and r.json()["status"] == "agent_running"
    assert ran == [moderate["id"]]


def test_decisions_and_approval_guard(client, fake_llm):
    fake_llm.cls = match("wrong_recipient_transfer")
    case = submit(client, "y")
    url = f"/api/cases/{case['id']}/decision"
    assert client.post(url, json={"action": "approve"}).status_code == 409  # nothing pending
    r = client.post(url, json={"action": "investigate"})
    assert r.json()["assigned_layer"] == 1
    actions = [d["action"] for d in client.get(f"/api/cases/{case['id']}").json()["decisions"]]
    assert actions[-1] == "investigate"


def test_learning_loop_map_category(client, fake_llm):
    fake_llm.cls = ClassificationResult()
    case = submit(client, "I want a mortgage")
    assert case["tier"] == "unknown"
    new = {"id": "loan_enquiry", "name": "Loan enquiry", "tier": "moderate"}
    assert client.post("/api/categories", json=new).status_code == 201
    assert client.post("/api/categories", json=new).status_code == 409
    assert client.post("/api/categories", json={**new, "id": "Bad Id"}).status_code == 422
    r = client.post(
        f"/api/cases/{case['id']}/decision",
        json={"action": "map_category", "payload": {"category_id": "loan_enquiry"}},
    )
    assert (r.json()["tier"], r.json()["categories"]) == ("moderate", ["loan_enquiry"])
    assert client.post(
        f"/api/cases/{case['id']}/decision",
        json={"action": "map_category", "payload": {"category_id": "loan_enquiry"}},
    ).status_code == 409  # no longer unknown
    assert "human_added" in [c["source"] for c in client.get("/api/categories").json()]


def test_metrics(client, fake_llm, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "classifier_model", "")
    fake_llm.cls = match("unauthorized_transaction")
    submit(client, "x")
    m = client.get("/api/metrics").json()
    assert m["total_cases"] == 1 and m["by_tier"] == {"critical": 1}
    assert m["cost_saving_pct"] == 90.0  # cheap model (not agent_model) at ratio 10
    assert client.post("/api/eval/run").status_code == 503  # classifier model not configured in tests


def test_sse_replays_history_and_closes(client, fake_llm):
    from app import sse

    fake_llm.cls = match("wrong_recipient_transfer")
    case = submit(client, "y")  # pipeline emitted classify / evidence_fetch / report_generated
    sse.emit(case["id"], "agent_done", {"status": "resolved"})
    with client.stream("GET", f"/api/cases/{case['id']}/stream") as r:
        body = "".join(r.iter_text())
    for event in ("classify", "evidence_fetch", "report_generated", "agent_done"):
        assert f"event: {event}" in body
    assert client.get("/api/cases/999/stream").status_code == 404
