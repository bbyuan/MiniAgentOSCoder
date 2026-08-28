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


@router.post("/{run_id}/approve")
def approve_action(run_id: str, request: ApproveRequest) -> dict[str, object]:
    if run_id not in store.runs:
        raise HTTPException(status_code=404, detail="Run not found")
    approval = store.approvals.pop(request.approval_id, None)
    if approval is None:
        raise HTTPException(status_code=409, detail="No pending approval with this id")
    return {"run_id": run_id, "approval_id": request.approval_id, "status": "approved", "mode": request.mode}


@router.post("/{run_id}/deny")
def deny_action(run_id: str, request: DenyRequest) -> dict[str, object]:
    if run_id not in store.runs:
        raise HTTPException(status_code=404, detail="Run not found")
    approval = store.approvals.pop(request.approval_id, None)
    if approval is None:
        raise HTTPException(status_code=409, detail="No pending approval with this id")
    return {"run_id": run_id, "approval_id": request.approval_id, "status": "denied", "reason": request.reason}

