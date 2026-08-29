from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api.store import store
from app.runtime.model_provider import (
    ModelConfigurationError,
    inspect_model_configuration,
)
from app.runtime.paths import default_agent_dir

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/status")
def get_model_status(project_id: str | None = None) -> dict[str, object]:
    selected_project_id = project_id or store.current_project_id
    if selected_project_id is None:
        raise HTTPException(status_code=404, detail="No project is open")
    project = store.projects.get(selected_project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config_path = _find_config_path(project.path)
    try:
        status = inspect_model_configuration(config_path)
    except (ModelConfigurationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return status.to_dict()


def _find_config_path(project_path: Path) -> Path:
    local = project_path / ".agent" / "config.yaml"
    if local.exists():
        return local
    return default_agent_dir() / "config.yaml"
