from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import approvals, context, health, models, projects, runs, trace


def create_app() -> FastAPI:
    app = FastAPI(title="MiniAgentOS Coder Runtime", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
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
    app.include_router(models.router)
    return app


app = create_app()
