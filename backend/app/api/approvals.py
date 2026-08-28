from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.store import store

router = APIRouter(prefix="/runs", tags=["approvals"])


class ApproveRequest(BaseModel):
    approval_id: str
    mode: str = "approve_once"


class DenyRequest(BaseModel):
    approval_id: str
    reason: str


@router.get("/{run_id}/approval")
def get_pending_approval(run_id: str) -> dict[str, object]:
    if run_id not in store.runs:
        raise HTTPException(status_code=404, detail="Run not found")
    approval = next(
        (item for item in store.approvals.values() if item.run_id == run_id),
        None,
    )
    return {"approval": approval.to_dict() if approval is not None else None}


@router.post("/{run_id}/approve")
def approve_action(run_id: str, request: ApproveRequest) -> dict[str, object]:
    if run_id not in store.runs:
        raise HTTPException(status_code=404, detail="Run not found")
    if request.mode != "approve_once":
        raise HTTPException(status_code=422, detail="Only approve_once is supported")
    approval = store.approvals.get(request.approval_id)
    if approval is None or approval.run_id != run_id:
        raise HTTPException(status_code=409, detail="No pending approval with this id")
    if not store.worker.resolve_approval(run_id, request.approval_id, approved=True):
        raise HTTPException(status_code=409, detail="Approval is no longer waiting")
    store.approvals.pop(request.approval_id, None)
    return {"run_id": run_id, "approval_id": request.approval_id, "status": "approved", "mode": request.mode}


@router.post("/{run_id}/deny")
def deny_action(run_id: str, request: DenyRequest) -> dict[str, object]:
    if run_id not in store.runs:
        raise HTTPException(status_code=404, detail="Run not found")
    approval = store.approvals.get(request.approval_id)
    if approval is None or approval.run_id != run_id:
        raise HTTPException(status_code=409, detail="No pending approval with this id")
    if not store.worker.resolve_approval(
        run_id,
        request.approval_id,
        approved=False,
        reason=request.reason,
    ):
        raise HTTPException(status_code=409, detail="Approval is no longer waiting")
    store.approvals.pop(request.approval_id, None)
    return {"run_id": run_id, "approval_id": request.approval_id, "status": "denied", "reason": request.reason}
