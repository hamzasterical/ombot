"""Database instance id.

Complaint ids restart at 1 whenever the database is re-seeded, but fastn remembers tickets and
replies it already delivered. Scoping fastn's dedupe keys by a random per-database id keeps a
fresh database from colliding with deliveries made for an old one.
"""

import json
import uuid
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.db import engine
from app.models import AppMeta

INSTANCE_KEY = "instance_id"


def instance_id() -> str:
    # Not cached: the seed script recreates the database underneath a running server.
    with Session(engine) as session:
        row = session.get(AppMeta, INSTANCE_KEY)
        if row is not None:
            return row.value
        session.add(AppMeta(key=INSTANCE_KEY, value=uuid.uuid4().hex[:12]))
        try:
            session.commit()
        except IntegrityError:  # a concurrent request created it first
            session.rollback()
        return session.get(AppMeta, INSTANCE_KEY).value


def dedupe_key(complaint_id: int | str) -> str:
    return f"{instance_id()}:{complaint_id}"


def get_json(session: Session, key: str) -> Any:
    row = session.get(AppMeta, key)
    return json.loads(row.value) if row else None


def set_json(session: Session, key: str, value: Any) -> None:
    row = session.get(AppMeta, key) or AppMeta(key=key, value="")
    row.value = json.dumps(value, default=str)
    session.add(row)
    session.commit()
