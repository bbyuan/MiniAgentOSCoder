from fastapi import FastAPI

from app.api import approvals, context, health, projects, runs, trace


def create_app() -> FastAPI:
    app = FastAPI(title="MiniAgentOS Coder Runtime", version="0.1.0")
    app.include_router(health.router)
    app.include_router(projects.router)
    app.include_router(runs.router)
    app.include_router(approvals.router)
    app.include_router(trace.router)
    app.include_router(context.router)
    return app


app = create_app()
