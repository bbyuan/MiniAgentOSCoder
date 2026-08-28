from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.store import store
from app.models import RunPhase
from app.runtime.agent_loop import create_runtime_run
from app.runtime.artifacts import build_run_artifacts
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.tracer import TraceWriter

router = APIRouter(prefix="/runs", tags=["runs"])


class CreateRunRequest(BaseModel):
    project_id: str
    task: str
    mode: str = "Bugfix"


@router.post("")
def create_run(request: CreateRunRequest) -> dict[str, object]:
    project = store.projects.get(request.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config_path = _find_config_path(project.path)
    run = create_runtime_run(request.task, project.path, config_path, runs_dir=project.path / "runs")
    contract = compile_agent_contract(config_path, task_mode=request.mode, project_profile=project.profile)
    run.mode = request.mode
    trace_events = TraceWriter(project.path / "runs").read_events(run.run_id)
    artifacts, context_pack = build_run_artifacts(run, project.profile, trace_events)
    store.runs[run.run_id] = run
    store.contracts[run.run_id] = contract
    store.contexts[run.run_id] = context_pack
    store.artifacts[run.run_id] = artifacts

    return {
        "run_id": run.run_id,
        "status": run.status.value,
        "phase": run.status.value,
        "contract": contract.to_dict(),
        "artifacts": artifacts.to_dict(),
    }


@router.get("/{run_id}")
def get_run(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    artifacts = store.artifacts.get(run_id)
    return {
        "run_id": run.run_id,
        "status": run.status.value,
        "phase": run.status.value,
        "current_action": None,
        "task": run.task,
        "mode": run.mode,
        "plan": [step.to_dict() for step in artifacts.plan] if artifacts else [],
    }


@router.get("/{run_id}/artifacts")
def get_run_artifacts(run_id: str) -> dict[str, object]:
    artifacts = store.artifacts.get(run_id)
    if artifacts is None:
        raise HTTPException(status_code=404, detail="Run artifacts not found")
    return artifacts.to_dict()


@router.post("/{run_id}/cancel")
def cancel_run(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    run.status = RunPhase.CANCELLED
    return {"run_id": run.run_id, "status": run.status.value}


def _find_config_path(project_path: Path) -> Path:
    local = project_path / ".agent" / "config.yaml"
    if local.exists():
        return local
    return Path(__file__).resolve().parents[3] / ".agent" / "config.yaml"
