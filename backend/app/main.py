import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app import llm
from app.auth import require_user
from app.config import settings
from app.db import engine, init_db
from app.models import Category
from app.pipeline import recover_interrupted
from app.seeding import build
from app.routers import audit, auth, cases, categories, complaints, eval, inbound, metrics

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "ombot_frontend" / "dist"


log = logging.getLogger(__name__)

LLM_SETTINGS = ("llm_api_key", "classifier_model", "report_model", "low_tier_reply_model", "agent_model")


def missing_llm_settings() -> list[str]:
    return [name.upper() for name in LLM_SETTINGS if not getattr(settings, name)]


def seed_if_empty() -> None:
    """A fresh container starts with an empty database: load the demo dataset once."""
    with Session(engine) as session:
        if session.exec(select(Category)).first() is not None:
            return
        summary = build(session)
    log.info("Seeded empty database: %s", summary.counts)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if missing := missing_llm_settings():
        log.warning("LLM is not configured (%s unset): every complaint will go to the Unknown queue", ", ".join(missing))
    if settings.seed_on_startup:
        seed_if_empty()
    with Session(engine) as session:
        if recovered := recover_interrupted(session):
            log.warning("%s case(s) were interrupted by the restart and went back to a human", recovered)
    poller = None
    if settings.inbound_email_enabled and settings.fastn_enabled:
        from app.inbound_email import poll_forever

        poller = asyncio.create_task(poll_forever())
    yield
    if poller:
        poller.cancel()


app = FastAPI(title="Ombot", lifespan=lifespan)


@app.get("/health")
@app.get("/api/health")
def health() -> dict:
    retry_in = llm.breaker_retry_in()
    missing = missing_llm_settings()
    return {
        "status": "ok",
        "llm": {
            "available": retry_in == 0,
            "retry_in_seconds": retry_in,
            "configured": not missing,
            "missing": missing,  # env vars to set; without them every complaint lands in the Unknown queue
        },
    }


app.include_router(auth.router, prefix="/api")
for module in (complaints, cases, categories, audit, metrics, eval, inbound):
    app.include_router(module.router, prefix="/api")  # no sign-in required (demo build)


# Serve the built frontend (single service, one port). Registered last so /api wins.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404)
        file = FRONTEND_DIST / path
        return FileResponse(file if path and file.is_file() else FRONTEND_DIST / "index.html")
