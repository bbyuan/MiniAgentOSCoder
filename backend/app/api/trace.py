from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.api.store import store
from app.models import RunPhase
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


@router.get("/{run_id}/events/stream")
def stream_events(run_id: str, request: Request, after: int = 0) -> StreamingResponse:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    writer = TraceWriter(project.path / "runs")
    cursor = max(0, after)

    async def event_source():
        nonlocal cursor
        heartbeat_ticks = 0
        while True:
            if await request.is_disconnected():
                return
            events = writer.read_events(run_id)
            for event in events[cursor:]:
                cursor += 1
                payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
                yield f"id: {cursor}\nevent: trace\ndata: {payload}\n\n"

            terminal = run.status in {RunPhase.COMPLETED, RunPhase.FAILED, RunPhase.CANCELLED}
            if terminal and cursor >= len(events):
                return

            heartbeat_ticks += 1
            if heartbeat_ticks >= 100:
                heartbeat_ticks = 0
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.1)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{run_id}/replay")
def replay_run(run_id: str) -> dict[str, object]:
    trace = get_trace(run_id)
    events = trace["events"]
    return {
        "run_id": run_id,
        "replayed": True,
        "read_only": True,
        "event_count": len(events),
        "events": events,
    }


def _project_for_run(run_id: str):
    run = store.runs.get(run_id)
    if run is None:
        return None
    project_id = store.run_projects.get(run_id)
    if project_id is not None:
        return store.projects.get(project_id)
    for project in store.projects.values():
        if (project.path / "runs" / run_id / "trace.jsonl").exists():
            return project
    return None
