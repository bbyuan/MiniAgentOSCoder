from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.store import store

router = APIRouter(prefix="/runs", tags=["context"])


@router.get("/{run_id}/context")
def get_context(run_id: str) -> dict[str, object]:
    context_pack = store.contexts.get(run_id)
    if context_pack is None:
        raise HTTPException(status_code=404, detail="Context not found")
    return context_pack.to_dict()


@router.post("/{run_id}/context/compact")
def compact_context(run_id: str) -> dict[str, object]:
    context_pack = store.contexts.get(run_id)
    if context_pack is None:
        raise HTTPException(status_code=404, detail="Context not found")
    return {"run_id": run_id, "status": "skipped", "reason": "No compaction needed in P0 skeleton"}

