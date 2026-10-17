from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_health(monkeypatch):
    for name in ("llm_api_key", "classifier_model", "report_model", "low_tier_reply_model", "agent_model"):
        monkeypatch.setattr(settings, name, "x")
    with TestClient(app) as client:
        assert client.get("/api/health").json() == {
            "status": "ok",
            "llm": {"available": True, "retry_in_seconds": 0, "configured": True, "missing": []},
        }


def test_health_names_missing_llm_settings(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.setattr(settings, "agent_model", "")
    with TestClient(app) as client:
        llm = client.get("/api/health").json()["llm"]
    assert llm["configured"] is False and llm["missing"] == ["LLM_API_KEY", "AGENT_MODEL"]
