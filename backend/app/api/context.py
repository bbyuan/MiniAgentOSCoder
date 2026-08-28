from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from uuid import uuid4

from app.api.store import store
from app.context import compact_context_pack, explain_context_items
from app.models import Checkpoint
from app.runtime.checkpoint import CheckpointStore
from app.runtime.tracer import TraceWriter

router = APIRouter(prefix="/runs", tags=["context"])


class CompactContextRequest(BaseModel):
    force: bool = False
    target_ratio: float = Field(default=0.55, ge=0.25, le=0.85)
    confirmed: bool = False


@router.get("/{run_id}/context")
def get_context(run_id: str) -> dict[str, object]:
    context_pack = store.contexts.get(run_id)
    if context_pack is None:
        raise HTTPException(status_code=404, detail="Context not found")
    data = context_pack.to_dict()
    data.pop("items", None)
    data["explanation"] = explain_context_items(context_pack.items, context_pack)
    return data


@router.post("/{run_id}/context/compact")
def compact_context(run_id: str, request: CompactContextRequest) -> dict[str, object]:
    context_pack = store.contexts.get(run_id)
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if context_pack is None or run is None or project is None:
        raise HTTPException(status_code=404, detail="Context not found")
    with store.context_lock:
        result = compact_context_pack(
            context_pack,
            force=request.force,
            target_ratio=request.target_ratio,
            confirmed=request.confirmed,
        )
        if result.status == "compacted":
            checkpoint_id = f"context-{uuid4().hex[:10]}"
            run.last_checkpoint_id = checkpoint_id
            tracer = TraceWriter(project.path / "runs")
            checkpoint = Checkpoint(
                checkpoint_id=checkpoint_id,
                run_id=run_id,
                step=run.current_step,
                status=run.status,
                run_state=run.to_dict(),
                context_summary=", ".join(context_pack.selected_items + context_pack.compressed_items),
                memory_snapshot={"refs": list(run.memory_refs)},
                changed_files=list(run.changed_files),
                trace_offset=len(tracer.read_events(run_id)),
            )
            path = CheckpointStore(project.path / "runs").save(checkpoint)
            tracer.event(
                run_id,
                "context.compacted",
                {**result.to_dict(), "trigger": "manual", "checkpoint_id": checkpoint_id},
            )
            tracer.event(run_id, "checkpoint.saved", {"checkpoint_id": checkpoint_id, "path": str(path)})
            artifacts = store.artifacts.get(run_id)
            if artifacts is not None:
                artifacts.context_explanation = explain_context_items(context_pack.items, context_pack)
    return {"run_id": run_id, **result.to_dict()}


def _project_for_run(run_id: str):
    project_id = store.run_projects.get(run_id)
    return store.projects.get(project_id) if project_id is not None else None
