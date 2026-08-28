from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.store import store
from app.guards import redact_secrets
from app.models import RunLoopResult, RunPhase
from app.runtime.agent_loop import create_runtime_run
from app.runtime.artifacts import build_run_artifacts
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_provider import ModelConfigurationError, create_model_client
from app.runtime.recovery import RecoveryError, RunRecovery
from app.runtime.run_artifact_writer import RunArtifactWriter
from app.runtime.run_worker import RunJob, RunWorkerConflict
from app.runtime.state_machine import transition_run
from app.runtime.tracer import TraceWriter

router = APIRouter(prefix="/runs", tags=["runs"])


class CreateRunRequest(BaseModel):
    project_id: str
    task: str
    mode: str = "Bugfix"


class RollbackRequest(BaseModel):
    checkpoint_id: str


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
    pending_approval = next(
        (approval for approval in store.approvals.values() if approval.run_id == run_id),
        None,
    )
    return {
        "run_id": run.run_id,
        "status": run.status.value,
        "phase": run.status.value,
        "current_action": run.last_observation.get("action_type"),
        "waiting_on": pending_approval.approval_id if pending_approval is not None else None,
        "task": run.task,
        "mode": run.mode,
        "plan": [step.to_dict() for step in artifacts.plan] if artifacts else [],
        "budget": run.budget,
        "last_observation": run.last_observation,
        "termination_reason": result.termination_reason if result else None,
        "final_message": result.final_message if result else "",
        "repair_attempts": run.repair_attempts,
        "repair_status": run.repair_status,
        "last_checkpoint_id": run.last_checkpoint_id,
        "rolled_back_to": run.rolled_back_to,
        "applied_patches": run.applied_patches,
    }


@router.post("/{run_id}/start", status_code=202)
def start_run(run_id: str) -> dict[str, object]:
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
        artifacts=store.artifacts.get(run_id),
        on_approval_requested=lambda approval: store.approvals.__setitem__(approval.approval_id, approval),
        on_approval_resolved=lambda approval_id: store.approvals.pop(approval_id, None),
    )
    try:
        store.worker.start(job)
    except RunWorkerConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

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


@router.get("/{run_id}/report")
def get_run_report(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    writer = RunArtifactWriter(project.path, run_id)
    if not writer.report_path.is_file():
        return {
            "run_id": run_id,
            "available": False,
            "content": "",
            "patch_available": writer.patch_path.is_file(),
            "patch_count": run.applied_patches,
            "files": run.changed_files,
        }
    return {
        "run_id": run_id,
        "available": True,
        "content": writer.report_path.read_text(encoding="utf-8"),
        "path": str(writer.report_path),
        "generated_at": datetime.fromtimestamp(
            writer.report_path.stat().st_mtime,
            tz=timezone.utc,
        ).isoformat(),
        "patch_available": writer.patch_path.is_file(),
        "patch_count": run.applied_patches,
        "files": run.changed_files,
    }


@router.get("/{run_id}/checkpoints")
def get_run_checkpoints(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    points = RunRecovery(project.path, run_id).list_points(run_active=store.worker.is_active(run_id))
    return {
        "run_id": run_id,
        "repair_attempts": run.repair_attempts,
        "repair_status": run.repair_status,
        "rolled_back_to": run.rolled_back_to,
        "checkpoints": [point.to_dict() for point in points],
    }


@router.post("/{run_id}/rollback")
def rollback_run(run_id: str, request: RollbackRequest) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if store.worker.is_active(run_id):
        raise HTTPException(status_code=409, detail="Cannot rollback an active run")

    recovery = RunRecovery(project.path, run_id)
    point = next(
        (item for item in recovery.list_points() if item.checkpoint_id == request.checkpoint_id),
        None,
    )
    if point is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    if not point.snapshot_available:
        raise HTTPException(status_code=409, detail="Checkpoint does not have a restorable snapshot")

    tracer = TraceWriter(project.path / "runs")
    tracer.event(run_id, "rollback.started", {"checkpoint_id": request.checkpoint_id, "files": point.files})
    try:
        summary = recovery.restore(request.checkpoint_id)
    except RecoveryError as exc:
        tracer.event(
            run_id,
            "rollback.failed",
            {"checkpoint_id": request.checkpoint_id, "error": str(exc)},
        )
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    run.changed_files = []
    run.rolled_back_to = request.checkpoint_id
    artifacts = store.artifacts.get(run_id)
    if artifacts is not None:
        artifacts.diff_summary.status = "Rolled back"
        artifacts.diff_summary.files = len(summary.files)
        artifacts.diff_summary.insertions = 0
        artifacts.diff_summary.deletions = 0
    tracer.event(
        run_id,
        "rollback.completed",
        {
            "checkpoint_id": request.checkpoint_id,
            "files": summary.files,
            "restored": summary.restored,
            "removed": summary.removed,
            "status": run.status.value,
        },
    )
    _regenerate_report(run_id, tracer)
    return {
        "run_id": run_id,
        "checkpoint_id": request.checkpoint_id,
        "status": "rolled_back",
        "files": summary.files,
        "restored": summary.restored,
        "removed": summary.removed,
    }


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
            _regenerate_report(run_id, tracer)
    return {"run_id": run.run_id, "status": run.status.value}


def _find_config_path(project_path: Path) -> Path:
    local = project_path / ".agent" / "config.yaml"
    if local.exists():
        return local
    return Path(__file__).resolve().parents[3] / ".agent" / "config.yaml"


def _project_for_run(run_id: str):
    project_id = store.run_projects.get(run_id)
    return store.projects.get(project_id) if project_id is not None else None


def _regenerate_report(run_id: str, tracer: TraceWriter) -> None:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    contract = store.contracts.get(run_id)
    context_pack = store.contexts.get(run_id)
    result = store.run_results.get(run_id)
    if run is None or project is None or contract is None or context_pack is None or result is None:
        return
    writer = RunArtifactWriter(project.path, run_id)
    try:
        report_path = writer.write_report(
            run=run,
            contract=contract,
            context_pack=context_pack,
            artifacts=store.artifacts.get(run_id),
            result=result,
            trace_events=tracer.read_events(run_id),
        )
        artifacts = store.artifacts.get(run_id)
        if artifacts is not None:
            for step in artifacts.plan:
                if step.id == "report":
                    step.state = "done"
                    break
        tracer.event(
            run_id,
            "report.generated",
            {
                "path": str(report_path),
                "patch_available": writer.patch_path.exists(),
                "patch_count": run.applied_patches,
            },
        )
    except (OSError, ValueError) as exc:
        tracer.event(run_id, "report.failed", {"error": redact_secrets(str(exc))})
