from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import approvals, context, evaluation, evidence, extensions, governance, health, history, memory, models, projects, runs, trace
from app.api.store import store
from app.runtime.history_store import default_history_path


def create_app(history_path: str | Path | None = ":memory:") -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if history_path is None:
            store.configure_history(default_history_path())
        yield

    if history_path is not None:
        store.configure_history(history_path)
    app = FastAPI(title="MiniAgentOS Coder Runtime", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://tauri.localhost",
            "tauri://localhost",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(projects.router)
    app.include_router(runs.router)
    app.include_router(approvals.router)
    app.include_router(trace.router)
    app.include_router(context.router)
    app.include_router(evidence.router)
    app.include_router(memory.router)
    app.include_router(governance.router)
    app.include_router(extensions.router)
    app.include_router(models.router)
    app.include_router(history.router)
    app.include_router(evaluation.router)
    return app


app = create_app(history_path=None)
