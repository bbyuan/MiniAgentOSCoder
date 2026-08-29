from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.store import ProjectRecord, store
from app.context import MemoryStore, MemoryStoreError, consolidate_run_memory, explain_context_items, refresh_context_pack
from app.guards import redact_secrets
from app.models import ContextItem, GovernanceSettings, MemoryScope, RunLoopResult, RunPhase, RunState
from app.runtime.checkpoint import CheckpointStore
from app.runtime.agent_loop import create_runtime_run
from app.runtime.artifacts import build_run_artifacts
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.config import load_governance_settings
from app.runtime.completion_guard import completion_expectations
from app.runtime.extensions import load_extension_catalog
from app.runtime.model_provider import ModelConfigurationError, create_model_client
from app.runtime.paths import default_agent_dir
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


class SteerRunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ResumeRunRequest(BaseModel):
    checkpoint_id: str | None = None
    restore_workspace: bool = False


@router.post("")
def create_run(request: CreateRunRequest) -> dict[str, object]:
    project = store.projects.get(request.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config_path = _find_config_path(project.path)
    run = create_runtime_run(request.task, project.path, config_path, runs_dir=project.path / "runs")
    contract = compile_agent_contract(config_path, task_mode=request.mode, project_profile=project.profile)
    governance = load_governance_settings(config_path)
    fallback_agent_dir = default_agent_dir()
    extension_catalog, extension_settings, skills_registry = load_extension_catalog(
        project.path,
        request.mode,
        fallback_agent_dir=fallback_agent_dir,
    )
    run.mode = request.mode
    tracer = TraceWriter(project.path / "runs")
    trace_events = tracer.read_events(run.run_id)
    try:
        memory_store = MemoryStore(project.path)
        memories = memory_store.list(MemoryScope.PROJECT) + memory_store.list(MemoryScope.LONG_TERM)
    except MemoryStoreError as exc:
        memories = []
        tracer.event(run.run_id, "memory.load_failed", {"error": redact_secrets(str(exc))})
    run.memory_refs = [memory.memory_id for memory in memories]
    artifacts, context_pack = build_run_artifacts(
        run,
        project.profile,
        trace_events,
        memories,
        workspace_root=project.path,
    )
    store.runs[run.run_id] = run
    store.contracts[run.run_id] = contract
    store.contexts[run.run_id] = context_pack
    store.artifacts[run.run_id] = artifacts
    store.run_projects[run.run_id] = project.project_id
    store.governance[run.run_id] = governance
    store.extension_catalogs[run.run_id] = extension_catalog
    store.extension_settings[run.run_id] = extension_settings
    store.skills_registries[run.run_id] = skills_registry
    tracer.event(
        run.run_id,
        "memory.loaded",
        {"count": len(memories), "memory_ids": [memory.memory_id for memory in memories]},
    )
    tracer.event(
        run.run_id,
        "context.built",
        {
            "required_items": context_pack.required_items,
            "selected_items": context_pack.selected_items,
            "omitted_items": context_pack.omitted_items,
            "composition": context_pack.composition,
        },
    )
    tracer.event(
        run.run_id,
        "extension.catalog.loaded",
        {
            "skills": len(extension_catalog.skills),
            "mcp_servers": len(extension_catalog.mcp_servers),
            "hooks": len(extension_catalog.hooks),
            "diagnostics": extension_catalog.diagnostics,
        },
    )
    try:
        store.history.record_run(run, project.project_id, project.path, artifacts)
    except Exception as exc:
        tracer.event(run.run_id, "history.persist_failed", {"error": redact_secrets(str(exc))})

    return {
        "run_id": run.run_id,
        "status": run.status.value,
        "phase": run.status.value,
        "contract": contract.to_dict(),
        "artifacts": artifacts.to_dict(),
        "completion_expectations": completion_expectations(run.mode),
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
        "completion": result.completion.to_dict() if result and result.completion else None,
        "completion_expectations": completion_expectations(run.mode),
        "repair_attempts": run.repair_attempts,
        "repair_status": run.repair_status,
        "last_checkpoint_id": run.last_checkpoint_id,
        "rolled_back_to": run.rolled_back_to,
        "applied_patches": run.applied_patches,
        "memory_refs": run.memory_refs,
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
        on_state_changed=lambda current, result: _persist_run_snapshot(current, result),
        governance=store.governance.get(run_id, GovernanceSettings()),
        extension_catalog=store.extension_catalogs.get(run_id),
        extension_settings=store.extension_settings.get(run_id),
        skills_registry_path=store.skills_registries.get(run_id),
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


@router.post("/{run_id}/resume")
def resume_run(run_id: str, request: ResumeRunRequest) -> dict[str, object]:
    if store.worker.is_active(run_id):
        raise HTTPException(status_code=409, detail="Cannot resume an active run")
    if run_id in store.runs and store.runs[run_id].status == RunPhase.COMPLETED:
        raise HTTPException(status_code=409, detail="Completed runs cannot be resumed")

    historical = store.history.get_run(run_id)
    if historical is None:
        raise HTTPException(status_code=404, detail="Historical run not found")
    if historical["status"] not in {"interrupted", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail=f"Run cannot resume from status: {historical['status']}")

    workspace = Path(str(historical["project_path"])).resolve()
    if not workspace.is_dir():
        raise HTTPException(status_code=409, detail="Run workspace is no longer available")
    checkpoints = CheckpointStore(workspace / "runs").list(run_id)
    checkpoint = next(
        (item for item in checkpoints if item.checkpoint_id == request.checkpoint_id),
        checkpoints[-1] if checkpoints and request.checkpoint_id is None else None,
    )
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    restored = None
    recovery = RunRecovery(workspace, run_id)
    if request.restore_workspace:
        point = next((item for item in recovery.list_points() if item.checkpoint_id == checkpoint.checkpoint_id), None)
        if point is None or not point.snapshot_available:
            raise HTTPException(status_code=409, detail="Checkpoint does not have a restorable snapshot")
        try:
            restored = recovery.restore(checkpoint.checkpoint_id)
        except RecoveryError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    project_id = str(historical["project_id"])
    profile = historical.get("project_profile", {})
    project = ProjectRecord(project_id=project_id, path=workspace, profile=profile)
    store.projects[project_id] = project
    store.current_project_id = project_id

    state = checkpoint.run_state
    run = RunState(
        run_id=run_id,
        task=str(historical["task"]),
        status=RunPhase.PLANNING,
        mode=str(historical["mode"]),
        current_step=max(checkpoint.step, int(historical.get("steps", 0))),
        changed_files=list(state.get("changed_files", checkpoint.changed_files)),
        test_status=state.get("test_status"),
        budget=dict(state.get("budget", historical.get("budget", {}))),
        memory_refs=list(checkpoint.memory_snapshot.get("refs", [])),
        last_observation=dict(state.get("last_observation", {})),
        repair_attempts=int(state.get("repair_attempts", historical.get("repair_attempts", 0))),
        repair_status=str(state.get("repair_status", "not_started")),
        last_checkpoint_id=checkpoint.checkpoint_id,
        rolled_back_to=checkpoint.checkpoint_id if restored is not None else state.get("rolled_back_to"),
        applied_patches=int(state.get("applied_patches", historical.get("applied_patches", 0))),
    )
    config_path = _find_config_path(workspace)
    contract = compile_agent_contract(config_path, task_mode=run.mode, project_profile=profile)
    governance = load_governance_settings(config_path)
    extension_catalog, extension_settings, skills_registry = load_extension_catalog(
        workspace,
        run.mode,
        fallback_agent_dir=default_agent_dir(),
    )
    try:
        memory_store = MemoryStore(workspace)
        memories = memory_store.list(MemoryScope.PROJECT) + memory_store.list(MemoryScope.LONG_TERM)
    except MemoryStoreError:
        memories = []
    trace_events = TraceWriter(workspace / "runs").read_events(run_id)
    run.current_step, run.budget = _resume_usage(
        trace_events,
        minimum_step=run.current_step,
        persisted_budget=run.budget,
    )
    artifacts, context_pack = build_run_artifacts(
        run,
        profile,
        trace_events,
        memories,
        workspace_root=workspace,
    )
    resume_item = ContextItem(
        id=f"resume:{checkpoint.checkpoint_id}",
        type="resume_checkpoint",
        source=f"runs/{run_id}/checkpoints/{checkpoint.checkpoint_id}.json",
        reason="resume from persisted checkpoint",
        tokens=max(1, len(checkpoint.context_summary) // 4),
        priority=1.0,
        content=checkpoint.context_summary or "Checkpoint context summary was empty",
        metadata={"step": checkpoint.step, "trace_offset": checkpoint.trace_offset},
    )
    context_pack.items.append(resume_item)
    context_pack.required_items.append(resume_item.id)
    context_pack.selected_items.append(resume_item.id)
    refresh_context_pack(context_pack)
    artifacts.context_explanation = explain_context_items(context_pack.items, context_pack)

    store.runs[run_id] = run
    store.contracts[run_id] = contract
    store.contexts[run_id] = context_pack
    store.artifacts[run_id] = artifacts
    store.run_projects[run_id] = project_id
    store.governance[run_id] = governance
    store.extension_catalogs[run_id] = extension_catalog
    store.extension_settings[run_id] = extension_settings
    store.skills_registries[run_id] = skills_registry
    store.run_results.pop(run_id, None)
    if not store.history.reopen_run(run, artifacts=artifacts):
        raise HTTPException(status_code=409, detail="Historical run could not be reopened")

    tracer = TraceWriter(workspace / "runs")
    tracer.event(
        run_id,
        "run.resumed",
        {
            "checkpoint_id": checkpoint.checkpoint_id,
            "step": checkpoint.step,
            "trace_offset": checkpoint.trace_offset,
            "workspace_restored": restored is not None,
            "restored": {
                "files": restored.files,
                "restored": restored.restored,
                "removed": restored.removed,
            } if restored is not None else None,
            "status": RunPhase.PLANNING.value,
        },
    )
    return {
        "run_id": run_id,
        "status": run.status.value,
        "task": run.task,
        "mode": run.mode,
        "checkpoint_id": checkpoint.checkpoint_id,
        "workspace_restored": restored is not None,
        "project": {
            "project_id": project.project_id,
            "path": str(project.path),
            "profile_path": ".agent/project-profile.json",
            "status": "ready",
            "profile": project.profile,
        },
        "contract": contract.to_dict(),
        "artifacts": artifacts.to_dict(),
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
    _persist_run_snapshot(run, store.run_results.get(run_id))
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
        _consolidate_terminal_memory(run_id, tracer)
        if tracer is not None:
            tracer.event(
                run_id,
                "run.cancelled",
                {"status": RunPhase.CANCELLED.value, "termination_reason": "cancelled_before_start"},
            )
            _regenerate_report(run_id, tracer)
        _persist_run_snapshot(run, store.run_results.get(run_id))
    return {"run_id": run.run_id, "status": run.status.value}


@router.post("/{run_id}/steer", status_code=202)
def steer_run(run_id: str, request: SteerRunRequest) -> dict[str, object]:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run not found")
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Guidance cannot be empty")
    tracer = TraceWriter(project.path / "runs")
    if not store.worker.steer(
        run_id,
        message,
        on_queued=lambda: tracer.event(
            run_id,
            "user.guidance.queued",
            {"message": message, "applies_at": "next_safe_boundary"},
            role="user",
        ),
    ):
        raise HTTPException(status_code=409, detail="Run is not active")
    return {
        "run_id": run_id,
        "status": "queued",
        "applies_at": "next_safe_boundary",
    }


def _resume_usage(
    events: list[dict[str, object]],
    *,
    minimum_step: int,
    persisted_budget: dict[str, object],
) -> tuple[int, dict[str, int]]:
    steps = sum(1 for event in events if event.get("event") == "run.step.started")
    model_calls = sum(1 for event in events if event.get("event") == "model.requested")
    model_cache_hits = sum(1 for event in events if event.get("event") == "model.cache.hit")
    model_calls += sum(1 for event in events if event.get("event") == "model.request.skipped")
    tool_calls = sum(1 for event in events if event.get("event") in {"tool.executed", "tool.failed"})
    input_tokens = 0
    output_tokens = 0
    for event in events:
        if event.get("event") != "model.responded":
            continue
        payload = event.get("payload")
        response = payload.get("response") if isinstance(payload, dict) else None
        usage = response.get("usage") if isinstance(response, dict) else None
        if not isinstance(usage, dict):
            continue
        input_tokens += max(0, int(usage.get("input_tokens", usage.get("prompt_tokens", 0))))
        output_tokens += max(0, int(usage.get("output_tokens", usage.get("completion_tokens", 0))))
    budget = {
        "model_calls": max(model_calls, int(persisted_budget.get("model_calls", 0))),
        "model_cache_hits": max(model_cache_hits, int(persisted_budget.get("model_cache_hits", 0))),
        "tool_calls": max(tool_calls, int(persisted_budget.get("tool_calls", 0))),
        "input_tokens": max(input_tokens, int(persisted_budget.get("input_tokens", 0))),
        "output_tokens": max(output_tokens, int(persisted_budget.get("output_tokens", 0))),
    }
    budget["total_tokens"] = max(
        budget["input_tokens"] + budget["output_tokens"],
        int(persisted_budget.get("total_tokens", 0)),
    )
    return max(minimum_step, steps), budget


def _find_config_path(project_path: Path) -> Path:
    local = project_path / ".agent" / "config.yaml"
    if local.exists():
        return local
    return default_agent_dir() / "config.yaml"


def _project_for_run(run_id: str):
    project_id = store.run_projects.get(run_id)
    return store.projects.get(project_id) if project_id is not None else None


def _persist_run_snapshot(run: RunState, result: RunLoopResult | None) -> None:
    project = _project_for_run(run.run_id)
    if project is None:
        return
    try:
        store.history.update_run(
            run,
            result=result,
            artifacts=store.artifacts.get(run.run_id),
        )
    except Exception as exc:
        TraceWriter(project.path / "runs").event(
            run.run_id,
            "history.persist_failed",
            {"error": redact_secrets(str(exc))},
        )


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
        _persist_run_snapshot(run, result)
    except (OSError, ValueError) as exc:
        tracer.event(run_id, "report.failed", {"error": redact_secrets(str(exc))})


def _consolidate_terminal_memory(run_id: str, tracer: TraceWriter) -> None:
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    result = store.run_results.get(run_id)
    if run is None or project is None or result is None:
        return
    try:
        entry = consolidate_run_memory(MemoryStore(project.path), run, result, store.artifacts.get(run_id))
        if entry.memory_id not in run.memory_refs:
            run.memory_refs.append(entry.memory_id)
        tracer.event(
            run_id,
            "memory.written",
            {"memory_id": entry.memory_id, "scope": entry.scope.value, "kind": entry.kind, "automatic": True},
        )
    except (MemoryStoreError, OSError) as exc:
        tracer.event(run_id, "memory.failed", {"scope": "project", "error": redact_secrets(str(exc))})
