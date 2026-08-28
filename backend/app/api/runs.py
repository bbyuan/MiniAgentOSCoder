from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.store import store
from app.models import ContextPack, ContextPackBudget, RunPhase
from app.runtime.agent_loop import create_runtime_run
from app.runtime.contract_compiler import compile_agent_contract

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
    store.runs[run.run_id] = run
    store.contracts[run.run_id] = contract
    store.contexts[run.run_id] = ContextPack(
        run_id=run.run_id,
        required_items=["user_task", "project_profile"],
        selected_items=[],
        compressed_items=[],
        omitted_items=[],
        budget_report=ContextPackBudget(max_tokens=32000, used_tokens=0, remaining_tokens=32000),
    )

    return {
        "run_id": run.run_id,
        "status": run.status.value,
        "phase": run.status.value,
        "contract": contract.to_dict(),
    }


@router.get("/{run_id}")
def get_run(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "run_id": run.run_id,
        "status": run.status.value,
        "phase": run.status.value,
        "current_action": None,
        "task": run.task,
        "mode": run.mode,
    }


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

