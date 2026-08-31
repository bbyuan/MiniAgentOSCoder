from __future__ import annotations

from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.store import ProjectRecord, store
from app.context import build_workspace_index, scan_workspace, write_project_profile
from app.context.workspace_scan import IGNORED_DIRS, LANGUAGE_BY_SUFFIX
from app.guards import PathEscape, resolve_workspace_path
from app.runtime.agent_pack import (
    build_agent_pack_manifest,
    compare_agent_pack_drift,
    list_agent_pack_versions,
    save_agent_pack_version,
)
from app.runtime.model_provider import ModelConfigurationError
from app.runtime.model_routing import ModelRoutingError
from app.runtime.native_dialog import NativeDialogUnavailable, choose_local_directory
from app.runtime.paths import default_agent_dir
from app.runtime.protocols import discover_project_protocols

router = APIRouter(prefix="/projects", tags=["projects"])


class OpenProjectRequest(BaseModel):
    path: str


MAX_WORKSPACE_BROWSER_ITEMS = 900
MAX_FILE_PREVIEW_BYTES = 220_000
MAX_FILE_PREVIEW_LINES = 1_200


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


@router.get("/{project_id}/files")
def list_project_files(project_id: str, query: str = "") -> dict[str, object]:
    project = store.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    items: list[dict[str, object]] = []
    truncated = False
    normalized_query = query.strip().lower()
    try:
        root = resolve_workspace_path(project.path, ".")
    except PathEscape as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix().lower()):
        relative = path.relative_to(root)
        if _is_ignored(relative):
            if path.is_dir():
                continue
            continue
        rel_path = relative.as_posix()
        if normalized_query and normalized_query not in rel_path.lower():
            continue
        if len(items) >= MAX_WORKSPACE_BROWSER_ITEMS:
            truncated = True
            break
        if path.is_dir():
            items.append({
                "path": rel_path,
                "name": path.name,
                "kind": "directory",
                "size": 0,
                "language": "",
                "modified_at": path.stat().st_mtime,
            })
        elif path.is_file():
            stat = path.stat()
            items.append({
                "path": rel_path,
                "name": path.name,
                "kind": "file",
                "size": stat.st_size,
                "language": LANGUAGE_BY_SUFFIX.get(path.suffix, path.suffix.lstrip(".")),
                "modified_at": stat.st_mtime,
            })

    return {
        "project_id": project.project_id,
        "root": str(project.path),
        "items": items,
        "total": len(items),
        "truncated": truncated,
    }


@router.get("/{project_id}/files/content")
def read_project_file(project_id: str, path: str) -> dict[str, object]:
    project = store.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        resolved = resolve_workspace_path(project.path, path)
    except PathEscape as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if _is_ignored(resolved.relative_to(project.path)):
        raise HTTPException(status_code=404, detail="File not found")

    size = resolved.stat().st_size
    if size > MAX_FILE_PREVIEW_BYTES:
        return {
            "project_id": project.project_id,
            "path": resolved.relative_to(project.path).as_posix(),
            "available": False,
            "content": "",
            "language": LANGUAGE_BY_SUFFIX.get(resolved.suffix, resolved.suffix.lstrip(".")),
            "size": size,
            "truncated": False,
            "reason": "File is too large to preview",
        }

    data = resolved.read_bytes()
    if b"\0" in data[:4096]:
        return {
            "project_id": project.project_id,
            "path": resolved.relative_to(project.path).as_posix(),
            "available": False,
            "content": "",
            "language": "",
            "size": size,
            "truncated": False,
            "reason": "Binary files cannot be previewed",
        }

    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=415, detail="File is not valid UTF-8 text") from exc

    lines = text.splitlines()
    truncated = len(lines) > MAX_FILE_PREVIEW_LINES
    content = "\n".join(lines[:MAX_FILE_PREVIEW_LINES]) if truncated else text
    return {
        "project_id": project.project_id,
        "path": resolved.relative_to(project.path).as_posix(),
        "available": True,
        "content": content,
        "language": LANGUAGE_BY_SUFFIX.get(resolved.suffix, resolved.suffix.lstrip(".")),
        "size": size,
        "truncated": truncated,
        "reason": "",
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


@router.get("/{project_id}/protocols")
def get_project_protocols(project_id: str) -> dict[str, object]:
    project = store.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        protocols = discover_project_protocols(project.path)
    except OSError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "project_id": project.project_id,
        **protocols,
    }


@router.get("/{project_id}/agent-pack/versions")
def get_agent_pack_versions(project_id: str) -> dict[str, object]:
    project = store.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "project_id": project.project_id,
        "versions": list_agent_pack_versions(project.path),
    }


@router.get("/{project_id}/agent-pack/drift")
def get_agent_pack_drift(project_id: str, mode: str = "Feature") -> dict[str, object]:
    project = store.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config_path = project.path / ".agent" / "config.yaml"
    if not config_path.exists():
        config_path = default_agent_dir() / "config.yaml"
    try:
        manifest = build_agent_pack_manifest(
            project_id=project.project_id,
            workspace=project.path,
            project_profile=project.profile,
            config_path=config_path,
            mode=mode,
        )
        return compare_agent_pack_drift(manifest, project.path)
    except (ModelConfigurationError, ModelRoutingError, ValueError, OSError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{project_id}/agent-pack/versions", status_code=201)
def create_agent_pack_version(project_id: str, mode: str = "Feature") -> dict[str, object]:
    project = store.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config_path = project.path / ".agent" / "config.yaml"
    if not config_path.exists():
        config_path = default_agent_dir() / "config.yaml"
    try:
        manifest = build_agent_pack_manifest(
            project_id=project.project_id,
            workspace=project.path,
            project_profile=project.profile,
            config_path=config_path,
            mode=mode,
        )
        version = save_agent_pack_version(manifest, project.path)
    except (ModelConfigurationError, ModelRoutingError, ValueError, OSError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "project_id": project.project_id,
        "version": version,
    }


def _is_ignored(path: Path) -> bool:
    return any(part in IGNORED_DIRS or part.startswith(".tmp-") for part in path.parts)
