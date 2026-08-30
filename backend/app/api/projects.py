from __future__ import annotations

from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.store import ProjectRecord, store
from app.context import build_workspace_index, scan_workspace, write_project_profile
from app.runtime.agent_pack import build_agent_pack_manifest
from app.runtime.model_provider import ModelConfigurationError
from app.runtime.model_routing import ModelRoutingError
from app.runtime.native_dialog import NativeDialogUnavailable, choose_local_directory
from app.runtime.paths import default_agent_dir

router = APIRouter(prefix="/projects", tags=["projects"])


class OpenProjectRequest(BaseModel):
    path: str


@router.post("/select-directory")
def select_project_directory() -> dict[str, object]:
    try:
        selected = choose_local_directory()
    except NativeDialogUnavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    return {
        "path": str(selected) if selected is not None else None,
        "cancelled": selected is None,
    }


@router.post("/open")
def open_project(request: OpenProjectRequest) -> dict[str, object]:
    root = Path(request.path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise HTTPException(status_code=400, detail="Project path does not exist or is not a directory")

    profile = scan_workspace(root)
    profile_path = write_project_profile(profile, root)
    build_workspace_index(root, root / ".agent" / "index")

    persisted = store.history.upsert_project(root, profile.to_dict())
    project_id = str(persisted["project_id"])
    store.projects[project_id] = ProjectRecord(project_id=project_id, path=root, profile=profile.to_dict())
    store.current_project_id = project_id

    return {
        "project_id": project_id,
        "path": str(root),
        "profile_path": str(profile_path.relative_to(root)),
        "status": "ready",
        "profile": profile.to_dict(),
    }


@router.get("/current")
def current_project() -> dict[str, object]:
    if store.current_project_id is None:
        raise HTTPException(status_code=404, detail="No project is open")
    project = store.projects[store.current_project_id]
    return {
        "project_id": project.project_id,
        "path": str(project.path),
        "profile": project.profile,
        "status": "ready",
    }


@router.get("/{project_id}/agent-pack")
def get_agent_pack(project_id: str, mode: str = "Feature") -> dict[str, object]:
    project = store.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config_path = project.path / ".agent" / "config.yaml"
    if not config_path.exists():
        config_path = default_agent_dir() / "config.yaml"
    try:
        return build_agent_pack_manifest(
            project_id=project.project_id,
            workspace=project.path,
            project_profile=project.profile,
            config_path=config_path,
            mode=mode,
        )
    except (ModelConfigurationError, ModelRoutingError, ValueError, OSError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
