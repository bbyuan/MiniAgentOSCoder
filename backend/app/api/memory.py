from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.store import store
from app.context import MemoryStore, MemoryStoreError, build_short_term_memory
from app.models import MemoryScope
from app.runtime.tracer import TraceWriter

router = APIRouter(prefix="/runs", tags=["memory"])


class CreateMemoryRequest(BaseModel):
    scope: MemoryScope
    kind: str = "note"
    content: str
    tags: list[str] = Field(default_factory=list)
    confirmed: bool = False


class UpdateMemoryRequest(BaseModel):
    kind: str = "note"
    content: str
    tags: list[str] = Field(default_factory=list)
    confirmed: bool = False


@router.get("/{run_id}/memory")
def get_memory(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    memory_store = MemoryStore(project.path)
    try:
        short_term = build_short_term_memory(run, store.artifacts.get(run_id))
        project_entries = memory_store.list(MemoryScope.PROJECT)
        long_term = memory_store.list(MemoryScope.LONG_TERM)
    except MemoryStoreError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {
        "run_id": run_id,
        "entries": {
            "short_term": [entry.to_dict() for entry in short_term],
            "project": [entry.to_dict() for entry in project_entries],
            "long_term": [entry.to_dict() for entry in long_term],
        },
        "counts": {
            "short_term": len(short_term),
            "project": len(project_entries),
            "long_term": len(long_term),
        },
    }


@router.post("/{run_id}/memory", status_code=201)
def create_memory(run_id: str, request: CreateMemoryRequest) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        entry = MemoryStore(project.path).create(
            scope=request.scope,
            kind=request.kind,
            content=request.content,
            source="user",
            run_id=run_id,
            tags=request.tags,
            confirmed=request.confirmed,
        )
    except MemoryStoreError as exc:
        raise HTTPException(status_code=409 if "confirmation" in str(exc) else 422, detail=str(exc)) from exc
    if entry.memory_id not in run.memory_refs:
        run.memory_refs.append(entry.memory_id)
    _trace(run_id, "memory.written", entry, automatic=False)
    return {"run_id": run_id, "entry": entry.to_dict()}


@router.put("/{run_id}/memory/{memory_id}")
def update_memory(run_id: str, memory_id: str, request: UpdateMemoryRequest) -> dict[str, object]:
    project = _require_project(run_id)
    try:
        entry = MemoryStore(project.path).update(
            memory_id,
            content=request.content,
            kind=request.kind,
            tags=request.tags,
            confirmed=request.confirmed,
        )
    except MemoryStoreError as exc:
        status = 404 if "not found" in str(exc) else 409 if "confirmation" in str(exc) else 422
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    _trace(run_id, "memory.updated", entry, automatic=False)
    return {"run_id": run_id, "entry": entry.to_dict()}


@router.delete("/{run_id}/memory/{memory_id}")
def delete_memory(run_id: str, memory_id: str) -> dict[str, object]:
    project = _require_project(run_id)
    try:
        entry = MemoryStore(project.path).delete(memory_id)
    except MemoryStoreError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    run = store.runs[run_id]
    if memory_id in run.memory_refs:
        run.memory_refs.remove(memory_id)
    _trace(run_id, "memory.deleted", entry, automatic=False)
    return {"run_id": run_id, "deleted": memory_id, "scope": entry.scope.value}


def _require_project(run_id: str):
    if run_id not in store.runs:
        raise HTTPException(status_code=404, detail="Run not found")
    project = _project_for_run(run_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Run project not found")
    return project


def _project_for_run(run_id: str):
    project_id = store.run_projects.get(run_id)
    return store.projects.get(project_id) if project_id is not None else None


def _trace(run_id: str, event: str, entry, *, automatic: bool) -> None:
    project = _project_for_run(run_id)
    if project is None:
        return
    TraceWriter(project.path / "runs").event(
        run_id,
        event,
        {
            "memory_id": entry.memory_id,
            "scope": entry.scope.value,
            "kind": entry.kind,
            "automatic": automatic,
        },
    )

