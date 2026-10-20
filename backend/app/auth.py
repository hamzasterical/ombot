import base64
import hashlib
import hmac
import json
import secrets
import time

from fastapi import Cookie, Depends, HTTPException
from sqlmodel import Session

from app.config import settings
from app.db import get_session
from app.models import User

COOKIE = "ombot_session"
_SCRYPT = {"n": 2**14, "r": 8, "p": 1}
_fallback_secret = secrets.token_bytes(32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$")
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **_SCRYPT)
        return hmac.compare_digest(actual, bytes.fromhex(digest))
    except ValueError:
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _sign(body: str) -> str:
    key = settings.auth_secret.encode() if settings.auth_secret else _fallback_secret
    return _b64(hmac.new(key, body.encode(), hashlib.sha256).digest())


def make_token(user_id: str) -> str:
    exp = int(time.time()) + settings.auth_session_hours * 3600
    body = _b64(json.dumps({"uid": user_id, "exp": exp}).encode())
    return f"{body}.{_sign(body)}"


def read_token(token: str) -> str | None:
    """The user id a valid, unexpired token was issued for, else None."""
    body, _, sig = token.partition(".")
    if not hmac.compare_digest(sig, _sign(body)):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except ValueError:
        return None
    return data["uid"] if data.get("exp", 0) > time.time() else None


def require_user(
    session: Session = Depends(get_session), ombot_session: str | None = Cookie(default=None)
) -> User:
    user_id = read_token(ombot_session) if ombot_session else None
    user = session.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Not signed in")
    return user
