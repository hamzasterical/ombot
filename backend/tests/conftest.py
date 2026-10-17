import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.config import settings
from app.models import Case, Category, Complaint


@pytest.fixture(autouse=True)
def offline_gateway(monkeypatch):
    # .env may enable fastn for the real app; tests must never post to live Slack/ClickUp/Gmail
    monkeypatch.setattr(settings, "fastn_enabled", False)


@pytest.fixture(autouse=True)
def closed_breaker():
    from app import llm

    llm.reset_breaker()
    yield
    llm.reset_breaker()


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for cid, tier in [
            ("unauthorized_transaction", "critical"),
            ("wrong_recipient_transfer", "moderate"),
            ("app_or_login_issue", "low"),
        ]:
            s.add(Category(id=cid, name=cid, tier=tier))
        s.commit()
        yield s


@pytest.fixture
def case(session):
    complaint = Complaint(text="x")
    session.add(complaint)
    session.commit()
    c = Case(complaint_id=complaint.id)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@pytest.fixture
def client(session, monkeypatch):
    from fastapi.testclient import TestClient

    from app import pipeline, sse
    from app.db import get_session
    from app.main import app

    sse.reset()
    # Background work opens its own session; point it at the test database
    monkeypatch.setattr(pipeline, "engine", session.get_bind())

    def fresh_session():
        session.expire_all()  # the background task wrote through another session
        return session

    app.dependency_overrides[get_session] = fresh_session
    yield TestClient(app)  # no `with`: skips the lifespan so the real DB file is untouched
    app.dependency_overrides.clear()
