from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.store import store
from app.runtime.tracer import TraceWriter

router = APIRouter(prefix="/runs", tags=["trace"])


@router.get("/{run_id}/trace")
def get_trace(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    writer = TraceWriter(project.path / "runs")
    return {"run_id": run_id, "events": writer.read_events(run_id), "trace_path": str(writer.trace_path(run_id))}


@router.get("/{run_id}/events")
def get_events(run_id: str) -> dict[str, object]:
    trace = get_trace(run_id)
    return {"run_id": run_id, "events": trace["events"]}


@router.post("/{run_id}/replay")
def replay_run(run_id: str) -> dict[str, object]:
    trace = get_trace(run_id)
    return {"run_id": run_id, "replayed": True, "events": trace["events"]}


def _project_for_run(run_id: str):
    run = store.runs.get(run_id)
    if run is None:
        return None
    for project in store.projects.values():
        if (project.path / "runs" / run_id / "trace.jsonl").exists():
            return project
    return None
