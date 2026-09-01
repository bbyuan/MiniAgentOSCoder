from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import shutil
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.store import store
from app.runtime.checkpoint import CheckpointStore
from app.runtime.history_store import TERMINAL_STATUSES


router = APIRouter(prefix="/history", tags=["history"])
_REPORT_LIMIT = 200_000
_PATCH_LIMIT = 300_000
_TRACE_TAIL = 12
_COMPARISON_METRICS = (
    "steps",
    "model_calls",
    "tool_calls",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "applied_patches",
    "repair_attempts",
)


class CompareRunsRequest(BaseModel):
    run_ids: list[str] = Field(min_length=2, max_length=2)


class ArchiveRunRequest(BaseModel):
    archived: bool = True


@router.get("/projects")
def list_history_projects() -> dict[str, object]:
    projects = store.history.list_projects()
    return {"projects": projects, "total": len(projects)}


@router.get("/runs")
def list_history_runs(
    project_id: str | None = None,
    status: str | None = None,
    query: str | None = None,
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict[str, object]:
    runs, total = store.history.list_runs(
        project_id=project_id,
        status=status,
        query=query,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )
    return {"runs": runs, "total": total, "limit": limit, "offset": offset}


@router.get("/runs/{run_id}")
def get_history_run(run_id: str) -> dict[str, object]:
    run = _history_run(run_id)
    report = _read_report(run)
    trace = _read_trace(run)
    patch = _read_patch(run)
    artifacts = {
        "report": {
            "available": report["available"],
            "path": run["report_path"],
            "truncated": report["truncated"],
        },
        "trace": {
            "available": trace["available"],
            "path": run["trace_path"],
            "event_count": trace["event_count"],
        },
        "patch": {
            "available": patch["available"],
            "path": run["patch_path"],
            "truncated": patch["truncated"],
        },
    }
    return {
        "run": run,
        "artifacts": artifacts,
        "report": report,
        "trace": trace,
        "patch": patch,
        "resume": _resume_metadata(run),
    }


@router.post("/compare")
def compare_history_runs(request: CompareRunsRequest) -> dict[str, object]:
    if request.run_ids[0] == request.run_ids[1]:
        raise HTTPException(status_code=400, detail="Choose two distinct runs")
    runs = [_history_run(run_id) for run_id in request.run_ids]
    metrics = [
        {
            "key": key,
            "left": int(runs[0][key]),
            "right": int(runs[1][key]),
            "delta": int(runs[1][key]) - int(runs[0][key]),
        }
        for key in _COMPARISON_METRICS
    ]
    return {
        "runs": [_comparison_summary(run) for run in runs],
        "metrics": metrics,
    }


@router.put("/runs/{run_id}/archive")
def archive_history_run(run_id: str, request: ArchiveRunRequest) -> dict[str, object]:
    if not store.history.set_archived(run_id, request.archived):
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run_id, "archived": request.archived}


@router.delete("/runs/{run_id}")
def delete_history_run(run_id: str) -> dict[str, object]:
    active_run = store.runs.get(run_id)
    if store.worker.is_active(run_id) or (active_run is not None and active_run.status.value not in TERMINAL_STATUSES):
        raise HTTPException(status_code=409, detail="Active runs cannot be deleted")
    run = _history_run(run_id)
    run_dir = _run_artifact_dir(run)
    if run_dir.exists():
        try:
            shutil.rmtree(run_dir)
        except OSError as exc:
            raise HTTPException(status_code=409, detail=f"Unable to delete run artifacts: {exc}") from exc
    if not store.history.delete_run(run_id):
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run_id, "deleted": True}


def _history_run(run_id: str) -> dict[str, Any]:
    run = store.history.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    run["duration_ms"] = _duration_ms(run)
    return run


def _artifact_path(run: dict[str, Any], key: str) -> Path:
    workspace = Path(str(run["project_path"])).resolve()
    expected_root = (workspace / "runs" / str(run["run_id"])).resolve()
    candidate = Path(str(run[key])).expanduser().resolve()
    if not candidate.is_relative_to(expected_root):
        raise HTTPException(status_code=409, detail=f"Stored {key} is outside the run directory")
    return candidate


def _run_artifact_dir(run: dict[str, Any]) -> Path:
    workspace = Path(str(run["project_path"])).resolve()
    runs_root = (workspace / "runs").resolve()
    run_dir = (runs_root / str(run["run_id"])).resolve()
    if run_dir.parent != runs_root:
        raise HTTPException(status_code=409, detail="Stored run artifact directory is outside the runs directory")
    return run_dir


def _read_report(run: dict[str, Any]) -> dict[str, object]:
    path = _artifact_path(run, "report_path")
    if not path.is_file():
        return {"available": False, "content": "", "truncated": False}
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=409, detail=f"Unable to read run report: {exc}") from exc
    truncated = len(content) > _REPORT_LIMIT
    return {
        "available": True,
        "content": content[:_REPORT_LIMIT],
        "truncated": truncated,
    }


def _read_trace(run: dict[str, Any]) -> dict[str, object]:
    path = _artifact_path(run, "trace_path")
    if not path.is_file():
        return {"available": False, "event_count": 0, "recent_events": []}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise HTTPException(status_code=409, detail=f"Unable to read run trace: {exc}") from exc
    events: list[dict[str, Any]] = []
    for line in lines:
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return {
        "available": True,
        "event_count": len(events),
        "recent_events": events[-_TRACE_TAIL:],
    }


def _read_patch(run: dict[str, Any]) -> dict[str, object]:
    path = _artifact_path(run, "patch_path")
    if not path.is_file():
        return {"available": False, "content": "", "truncated": False}
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=409, detail=f"Unable to read run patch: {exc}") from exc
    truncated = len(content) > _PATCH_LIMIT
    return {
        "available": True,
        "content": content[:_PATCH_LIMIT],
        "truncated": truncated,
    }


def _comparison_summary(run: dict[str, Any]) -> dict[str, object]:
    return {
        "run_id": run["run_id"],
        "task": run["task"],
        "mode": run["mode"],
        "status": run["status"],
        "test_status": run["test_status"],
        "duration_ms": run["duration_ms"],
        "changed_files": run["changed_files"],
    }


def _resume_metadata(run: dict[str, Any]) -> dict[str, object]:
    eligible = run["status"] in {"interrupted", "failed", "cancelled"}
    workspace = Path(str(run["project_path"])).resolve()
    if not eligible or not workspace.is_dir():
        return {
            "available": False,
            "checkpoint_count": 0,
            "latest_checkpoint_id": None,
            "snapshot_available": False,
        }
    checkpoints = CheckpointStore(workspace / "runs").list(str(run["run_id"]))
    latest = checkpoints[-1] if checkpoints else None
    snapshot_available = False
    if latest is not None:
        snapshot_available = (
            workspace / "runs" / str(run["run_id"]) / "snapshots" / latest.checkpoint_id / "manifest.json"
        ).is_file()
    return {
        "available": latest is not None,
        "checkpoint_count": len(checkpoints),
        "latest_checkpoint_id": latest.checkpoint_id if latest is not None else None,
        "snapshot_available": snapshot_available,
    }


def _duration_ms(run: dict[str, Any]) -> int | None:
    end = run.get("completed_at") or run.get("updated_at")
    start = run.get("created_at")
    if not start or not end:
        return None
    try:
        return max(0, int((datetime.fromisoformat(str(end)) - datetime.fromisoformat(str(start))).total_seconds() * 1000))
    except ValueError:
        return None
