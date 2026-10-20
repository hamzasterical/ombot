import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import COOKIE, hash_password, make_token, require_user, verify_password
from app.config import settings
from app.db import get_session
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class SignUp(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)


class SignIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str


def _sign_in(response: Response, user: User) -> UserOut:
    response.set_cookie(
        COOKIE,
        make_token(user.id),
        max_age=settings.auth_session_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.auth_cookie_secure,
    )
    return UserOut(id=user.id, name=user.name, email=user.email)


def _find(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email.strip().lower())).first()


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(body: SignUp, response: Response, session: Session = Depends(get_session)):
    if _find(session, body.email):
        raise HTTPException(409, "An account with this email already exists")
    user = User(
        id=f"usr_{uuid.uuid4().hex[:12]}",
        name=body.name.strip(),
        email=body.email.strip().lower(),
        password_hash=hash_password(body.password),
    )
    session.add(user)
    session.commit()
    return _sign_in(response, user)


@router.post("/login", response_model=UserOut)
def login(body: SignIn, response: Response, session: Session = Depends(get_session)):
    user = _find(session, body.email)
    # one error for unknown email and wrong password
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return _sign_in(response, user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(require_user)):
    return UserOut(id=user.id, name=user.name, email=user.email)
