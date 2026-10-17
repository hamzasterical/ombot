import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.config import settings
from app.db import engine, init_db
from app.models import Category
from app.seeding import build
from app.routers import audit, cases, categories, complaints, eval, metrics

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "ombot_frontend" / "dist"


log = logging.getLogger(__name__)


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
    if settings.seed_on_startup:
        seed_if_empty()
    yield


app = FastAPI(title="Ombot", lifespan=lifespan)


@app.get("/health")
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


for module in (complaints, cases, categories, audit, metrics, eval):
    app.include_router(module.router, prefix="/api")


# Serve the built frontend (single service, one port). Registered last so /api wins.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404)
        file = FRONTEND_DIST / path
        return FileResponse(file if path and file.is_file() else FRONTEND_DIST / "index.html")
