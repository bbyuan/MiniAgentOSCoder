from __future__ import annotations

from fastapi import APIRouter

from app.api.store import store
from app.evaluation import build_evaluation_summary


router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.get("/summary")
def get_evaluation_summary(project_id: str | None = None) -> dict[str, object]:
    return build_evaluation_summary(store.history, project_id=project_id)
