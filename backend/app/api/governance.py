from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.store import store
from app.models import ApprovalPolicy, GovernanceSettings, RunPhase, SandboxProfile
from app.runtime.sandbox import SandboxExecutor
from app.runtime.tracer import TraceWriter
from app.tools import create_builtin_tool_registry

router = APIRouter(prefix="/runs", tags=["governance"])


class UpdateGovernanceRequest(BaseModel):
    sandbox_profile: SandboxProfile
    tool_overrides: dict[str, str] = Field(default_factory=dict)


@router.get("/{run_id}/governance")
def get_governance(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    contract = store.contracts.get(run_id)
    if run is None or project is None or contract is None:
        raise HTTPException(status_code=404, detail="Run not found")
    settings = store.governance.get(run_id, GovernanceSettings())
    descriptors = [registration[0] for registration in create_builtin_tool_registry(project.path)]
    tools = []
    for descriptor in descriptors:
        override = settings.tool_overrides.get(descriptor.name, "inherit")
        contract_policy = str(getattr(contract.policies, descriptor.name, descriptor.approval_policy.value))
        effective = (
            ApprovalPolicy.APPROVAL_REQUIRED.value
            if descriptor.approval_policy == ApprovalPolicy.APPROVAL_REQUIRED
            or contract_policy == ApprovalPolicy.APPROVAL_REQUIRED.value
            or override == "approval_required"
            else "deny" if contract_policy == "deny" or override == "deny" else descriptor.approval_policy.value
        )
        tools.append({**descriptor.to_dict(), "override": override, "effective_policy": effective})

    events = TraceWriter(project.path / "runs").read_events(run_id)
    evaluations = [
        event["payload"]["evaluation"]
        for event in events
        if event.get("event") == "policy.evaluated"
        and isinstance(event.get("payload"), dict)
        and isinstance(event["payload"].get("evaluation"), dict)
    ]
    executions = [
        event["payload"]
        for event in events
        if event.get("event") == "sandbox.finished" and isinstance(event.get("payload"), dict)
    ]
    return {
        "run_id": run_id,
        "editable": run.status == RunPhase.PLANNING and not store.worker.is_active(run_id),
        "settings": settings.to_dict(),
        "capabilities": SandboxExecutor.capabilities().to_dict(),
        "contract": {
            "effects": contract.effects.to_dict(),
            "policies": contract.policies.to_dict(),
        },
        "tools": tools,
        "evaluations": evaluations,
        "executions": executions,
    }


@router.put("/{run_id}/governance")
def update_governance(run_id: str, request: UpdateGovernanceRequest) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != RunPhase.PLANNING or store.worker.is_active(run_id):
        raise HTTPException(status_code=409, detail="Governance can only change before a run starts")

    descriptors = {registration[0].name: registration[0] for registration in create_builtin_tool_registry(project.path)}
    normalized: dict[str, str] = {}
    for tool, policy in request.tool_overrides.items():
        if tool not in descriptors:
            raise HTTPException(status_code=422, detail=f"Unknown tool override: {tool}")
        if policy not in {"inherit", "approval_required", "deny"}:
            raise HTTPException(status_code=422, detail=f"Unsupported tool policy: {policy}")
        if policy != "inherit":
            normalized[tool] = policy

    settings = GovernanceSettings(
        sandbox_profile=request.sandbox_profile,
        tool_overrides=normalized,
    )
    store.governance[run_id] = settings
    TraceWriter(project.path / "runs").event(
        run_id,
        "governance.updated",
        {
            "sandbox_profile": settings.sandbox_profile.value,
            "tool_overrides": settings.tool_overrides,
        },
    )
    return get_governance(run_id)


def _project_for_run(run_id: str):
    project_id = store.run_projects.get(run_id)
    return store.projects.get(project_id) if project_id is not None else None
