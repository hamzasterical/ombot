from fastapi.testclient import TestClient

from app.auth import make_token, read_token, require_user
from app.main import app


def anon_client(client):
    # the `client` fixture bypasses auth; drop that override to test the real thing
    app.dependency_overrides.pop(require_user, None)
    return TestClient(app)


def test_api_requires_sign_in(client):
    c = anon_client(client)
    assert c.get("/api/cases").status_code == 401
    assert c.get("/api/auth/me").status_code == 401


def test_signup_login_logout(client):
    c = anon_client(client)
    body = {"name": "Sam", "email": "Sam@Example.com", "password": "hunter2hunter2"}
    assert c.post("/api/auth/signup", json=body).status_code == 201
    assert c.get("/api/auth/me").json()["email"] == "sam@example.com"
    assert c.get("/api/cases").status_code == 200

    assert c.post("/api/auth/signup", json=body).status_code == 409

    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").status_code == 401

    wrong = {"email": "sam@example.com", "password": "wrong-password"}
    assert c.post("/api/auth/login", json=wrong).status_code == 401
    unknown = {"email": "nobody@example.com", "password": "hunter2hunter2"}
    assert c.post("/api/auth/login", json=unknown).status_code == 401
    ok = {"email": "SAM@example.com", "password": "hunter2hunter2"}
    assert c.post("/api/auth/login", json=ok).status_code == 200
    assert c.get("/api/auth/me").status_code == 200


def test_weak_signup_rejected(client):
    c = anon_client(client)
    assert c.post("/api/auth/signup", json={"name": "A", "email": "a@b.co", "password": "short"}).status_code == 422
    assert c.post("/api/auth/signup", json={"name": "A", "email": "nope", "password": "longenough1"}).status_code == 422


def test_tampered_token_rejected():
    token = make_token("usr_1")
    assert read_token(token) == "usr_1"
    assert read_token(token[:-2] + "xx") is None
