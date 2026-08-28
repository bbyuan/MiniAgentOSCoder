from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.api.store import store
from app.models import RunLoopResult, RunPhase
from app.runtime.agent_loop import create_runtime_run
from app.runtime.artifacts import build_run_artifacts
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_provider import ModelConfigurationError, create_model_client
from app.runtime.run_worker import RunJob, RunWorkerConflict
from app.runtime.state_machine import transition_run
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
    store.run_projects[run.run_id] = project.project_id

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
    result = store.run_results.get(run_id)
    return {
        "run_id": run.run_id,
        "status": run.status.value,
        "phase": run.status.value,
        "current_action": run.last_observation.get("action_type"),
        "task": run.task,
        "mode": run.mode,
        "plan": [step.to_dict() for step in artifacts.plan] if artifacts else [],
        "budget": run.budget,
        "last_observation": run.last_observation,
        "termination_reason": result.termination_reason if result else None,
        "final_message": result.final_message if result else "",
    }


@router.post("/{run_id}/start", status_code=202)
def start_run(run_id: str, background_tasks: BackgroundTasks) -> dict[str, object]:
    run = store.runs.get(run_id)
    contract = store.contracts.get(run_id)
    context_pack = store.contexts.get(run_id)
    project = _project_for_run(run_id)
    if run is None or contract is None or context_pack is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != RunPhase.PLANNING:
        raise HTTPException(status_code=409, detail=f"Run cannot start from status: {run.status.value}")

    config_path = _find_config_path(project.path)
    try:
        model_client = create_model_client(config_path)
    except ModelConfigurationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    tracer = TraceWriter(project.path / "runs")
    job = RunJob(
        run=run,
        workspace=project.path,
        contract=contract,
        context_pack=context_pack,
        model_client=model_client,
        tracer=tracer,
        on_result=lambda result: store.run_results.__setitem__(run_id, result),
    )
    try:
        store.worker.prepare(job)
    except RunWorkerConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    background_tasks.add_task(store.worker.execute, job)

    return {
        "run_id": run_id,
        "status": RunPhase.RUNNING.value,
        "events_url": f"/runs/{run_id}/events/stream",
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
    project = _project_for_run(run_id)
    tracer = TraceWriter(project.path / "runs") if project is not None else None
    if store.worker.cancel(run_id):
        if tracer is not None:
            tracer.event(run_id, "run.cancellation_requested", {"status": run.status.value})
        return {"run_id": run.run_id, "status": "cancellation_requested"}
    if run.status not in {RunPhase.COMPLETED, RunPhase.FAILED, RunPhase.CANCELLED}:
        transition_run(run, RunPhase.CANCELLED)
        store.run_results[run_id] = RunLoopResult(
            run_id=run_id,
            status=RunPhase.CANCELLED,
            termination_reason="cancelled_before_start",
        )
        if tracer is not None:
            tracer.event(
                run_id,
                "run.cancelled",
                {"status": RunPhase.CANCELLED.value, "termination_reason": "cancelled_before_start"},
            )
    return {"run_id": run.run_id, "status": run.status.value}


def _find_config_path(project_path: Path) -> Path:
    local = project_path / ".agent" / "config.yaml"
    if local.exists():
        return local
    return Path(__file__).resolve().parents[3] / ".agent" / "config.yaml"


def _project_for_run(run_id: str):
    project_id = store.run_projects.get(run_id)
    return store.projects.get(project_id) if project_id is not None else None
