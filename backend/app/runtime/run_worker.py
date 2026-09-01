from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
import re
from threading import Event, Lock, Thread
from uuid import uuid4

from app.context import (
    MemoryStore,
    MemoryStoreError,
    add_observation_item,
    compact_context_pack,
    consolidate_run_memory,
    explain_context_items,
    set_current_diff_item,
)
from app.guards import redact_secrets
from app.models import (
    ActiveSkill,
    ActionIR,
    AgentContract,
    ApprovalRequest,
    Checkpoint,
    ContextPack,
    ExtensionCatalog,
    ExtensionSettings,
    GovernanceSettings,
    HookEvent,
    PolicyEvaluation,
    RunArtifacts,
    RunLoopResult,
    RunPhase,
    RunState,
    ToolDescriptor,
    ToolResult,
)
from app.runtime.checkpoint import CheckpointStore
from app.runtime.model_client import ModelClient
from app.runtime.prompt_cache import PromptCache
from app.runtime.hooks import HookPipeline
from app.runtime.mcp import MCPRuntime
from app.runtime.run_loop import AgentRunLoop
from app.runtime.sandbox import SandboxExecutor
from app.runtime.run_artifact_writer import RunArtifactWriter
from app.runtime.state_machine import InvalidRunTransition, transition_run
from app.runtime.tracer import TraceWriter
from app.runtime.skills import activate_skills
from app.tools import PatchPipeline, PatchSummary, ToolApprovalDecision, ToolGateway, create_builtin_tool_registry


class RunWorkerConflict(RuntimeError):
    pass


@dataclass(slots=True)
class RunJob:
    run: RunState
    workspace: Path
    contract: AgentContract
    context_pack: ContextPack
    model_client: ModelClient
    tracer: TraceWriter
    on_result: Callable[[RunLoopResult], None]
    artifacts: RunArtifacts | None = None
    on_approval_requested: Callable[[ApprovalRequest], None] = lambda approval: None
    on_approval_resolved: Callable[[str], None] = lambda approval_id: None
    on_state_changed: Callable[[RunState, RunLoopResult | None], None] = lambda run, result: None
    governance: GovernanceSettings = field(default_factory=GovernanceSettings)
    extension_catalog: ExtensionCatalog = field(default_factory=ExtensionCatalog)
    extension_settings: ExtensionSettings = field(default_factory=ExtensionSettings)
    skills_registry_path: Path | None = None


@dataclass
class ApprovalWaiter:
    run_id: str
    event: Event = field(default_factory=Event)
    approved: bool | None = None
    reason: str = ""


@dataclass
class RunWorker:
    _cancel_events: dict[str, Event] = field(default_factory=dict)
    _steering_messages: dict[str, list[str]] = field(default_factory=dict)
    _approval_waiters: dict[str, ApprovalWaiter] = field(default_factory=dict)
    _threads: dict[str, Thread] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)
    prompt_cache: PromptCache = field(default_factory=PromptCache)

    def prepare(self, job: RunJob) -> None:
        with self._lock:
            if job.run.run_id in self._cancel_events:
                raise RunWorkerConflict("Run is already active")
            if job.run.status != RunPhase.PLANNING:
                raise RunWorkerConflict(f"Run cannot start from status: {job.run.status.value}")
            self._cancel_events[job.run.run_id] = Event()
            self._steering_messages[job.run.run_id] = []

        transition_run(job.run, RunPhase.RUNNING)
        if job.artifacts is not None:
            _set_plan_state(job.artifacts, "context", "done", "Task context is ready")
            _set_plan_state(job.artifacts, "inspect", "active")
        job.tracer.event(job.run.run_id, "run.transitioned", {"status": RunPhase.RUNNING.value})
        job.on_state_changed(job.run, None)

    def start(self, job: RunJob) -> None:
        self.prepare(job)
        thread = Thread(
            target=self.execute,
            args=(job,),
            daemon=True,
            name=f"miniagentos-{job.run.run_id}",
        )
        with self._lock:
            self._threads[job.run.run_id] = thread
        thread.start()

    def execute(self, job: RunJob) -> RunLoopResult:
        cancel_event = self._cancel_events.get(job.run.run_id)
        if cancel_event is None:
            raise RunWorkerConflict("Run was not prepared")

        mcp_runtime: MCPRuntime | None = None
        try:
            try:
                sandbox = SandboxExecutor(
                    job.workspace,
                    job.run.run_id,
                    profile=job.governance.sandbox_profile,
                    event_handler=lambda event, payload: job.tracer.event(job.run.run_id, event, payload),
                )
                enabled_skill_ids = set(job.extension_settings.active_skill_ids)
                skill_cards = [
                    skill for skill in job.extension_catalog.skills
                    if skill.id in enabled_skill_ids and skill.valid
                ] if job.skills_registry_path is not None else []
                job.tracer.event(
                    job.run.run_id,
                    "skill.cards.disclosed",
                    {"skill_ids": [skill.id for skill in skill_cards], "count": len(skill_cards)},
                )

                def load_skill(skill_id: str) -> ActiveSkill:
                    if job.skills_registry_path is None:
                        raise ValueError("Skill registry is unavailable")
                    return activate_skills(
                        skill_cards,
                        [skill_id],
                        job.skills_registry_path,
                    )[0]
                enabled_hook_ids = set(job.extension_settings.enabled_hook_ids)
                hooks = [
                    hook for hook in job.extension_catalog.hooks
                    if hook.id in enabled_hook_ids and hook.valid
                ]
                hook_pipeline = HookPipeline(job.run.run_id, hooks, sandbox, job.tracer)
                gateway = ToolGateway(
                    workspace_root=job.workspace,
                    contract=job.contract,
                    used_tool_calls=max(0, int(job.run.budget.get("tool_calls", 0))),
                    approval_handler=lambda action, descriptor, preview: self._request_approval(
                        job,
                        cancel_event,
                        action,
                        descriptor,
                        preview,
                    ),
                    result_handler=lambda action, result: self._record_tool_result(job, action, result),
                    policy_handler=lambda evaluation: self._record_policy_evaluation(job, evaluation),
                    governance=job.governance,
                    sandbox_validator=sandbox.validate_argv,
                    before_handler=lambda action, descriptor: hook_pipeline.execute(
                        HookEvent.TOOL_BEFORE,
                        action=action,
                        descriptor=descriptor,
                    ),
                    after_handler=lambda action, descriptor, tool_result: hook_pipeline.execute(
                        HookEvent.TOOL_AFTER,
                        action=action,
                        descriptor=descriptor,
                        result=tool_result,
                    ),
                    run_id=job.run.run_id,
                )
                for descriptor, handler, preflight in create_builtin_tool_registry(job.workspace, sandbox):
                    gateway.register(descriptor, handler, preflight)
                enabled_server_ids = set(job.extension_settings.enabled_mcp_server_ids)
                servers = [
                    server for server in job.extension_catalog.mcp_servers
                    if server.id in enabled_server_ids and server.valid
                ]
                mcp_runtime = MCPRuntime(
                    servers,
                    job.workspace,
                    job.run.run_id,
                    sandbox,
                    lambda event, payload: job.tracer.event(job.run.run_id, event, payload),
                )
                for descriptor, handler in mcp_runtime.registrations():
                    gateway.register(descriptor, handler)

                hook_pipeline.execute(HookEvent.RUN_BEFORE)
                result = AgentRunLoop(
                    run_id=job.run.run_id,
                    gateway=gateway,
                    model_client=job.model_client,
                    tracer=job.tracer,
                    should_cancel=cancel_event.is_set,
                    take_steering=lambda: self.take_steering(job.run.run_id),
                    on_step=lambda step: setattr(job.run, "current_step", step),
                    prompt_cache=self.prompt_cache,
                    skill_loader=load_skill,
                ).run(
                    task=job.run.task,
                    contract=job.contract,
                    context_pack=job.context_pack,
                    skill_cards=skill_cards,
                    mode=job.run.mode,
                    initial_steps=job.run.current_step,
                    initial_model_calls=max(0, int(job.run.budget.get("model_calls", 0))),
                    initial_token_usage={
                        "input_tokens": max(0, int(job.run.budget.get("input_tokens", 0))),
                        "output_tokens": max(0, int(job.run.budget.get("output_tokens", 0))),
                        "total_tokens": max(0, int(job.run.budget.get("total_tokens", 0))),
                    },
                    initial_model_cache_hits=max(0, int(job.run.budget.get("model_cache_hits", 0))),
                )
                hook_pipeline.execute(HookEvent.RUN_AFTER)
            except Exception as exc:
                error = redact_secrets(str(exc))
                result = RunLoopResult(
                    run_id=job.run.run_id,
                    status=RunPhase.FAILED,
                    termination_reason="worker_error",
                )
                job.tracer.event(
                    job.run.run_id,
                    "run.failed",
                    {
                        "status": RunPhase.FAILED.value,
                        "termination_reason": "worker_error",
                        "error": error,
                    },
                )

            if mcp_runtime is not None:
                mcp_runtime.close()

            self._record_result_data(job.run, result)
            self._consolidate_memory(job, result)
            self._finalize_plan(job, result)
            self._write_final_report(job, result)
            self._set_result_status(job.run, result.status)
            job.on_result(result)
            job.on_state_changed(job.run, result)
            job.tracer.event(job.run.run_id, "run.transitioned", {"status": result.status.value})
            return result
        finally:
            with self._lock:
                self._cancel_events.pop(job.run.run_id, None)
                self._steering_messages.pop(job.run.run_id, None)
                self._threads.pop(job.run.run_id, None)

    def steer(
        self,
        run_id: str,
        message: str,
        *,
        on_queued: Callable[[], None] = lambda: None,
    ) -> bool:
        guidance = message.strip()
        if not guidance:
            return False
        with self._lock:
            if run_id not in self._cancel_events:
                return False
            on_queued()
            self._steering_messages.setdefault(run_id, []).append(guidance)
            for waiter in self._approval_waiters.values():
                if waiter.run_id == run_id and not waiter.event.is_set():
                    waiter.approved = False
                    waiter.reason = "Superseded by user guidance"
                    waiter.event.set()
            return True

    def take_steering(self, run_id: str) -> list[str]:
        with self._lock:
            messages = self._steering_messages.get(run_id)
            if not messages:
                return []
            pending = list(messages)
            messages.clear()
            return pending

    def cancel(self, run_id: str) -> bool:
        with self._lock:
            cancel_event = self._cancel_events.get(run_id)
            if cancel_event is None:
                return False
            cancel_event.set()
            for waiter in self._approval_waiters.values():
                if waiter.run_id == run_id:
                    waiter.approved = False
                    waiter.reason = "Run cancelled while waiting for approval"
                    waiter.event.set()
            return True

    def resolve_approval(
        self,
        run_id: str,
        approval_id: str,
        *,
        approved: bool,
        reason: str = "",
    ) -> bool:
        with self._lock:
            waiter = self._approval_waiters.get(approval_id)
            if waiter is None or waiter.run_id != run_id or waiter.event.is_set():
                return False
            waiter.approved = approved
            waiter.reason = reason
            waiter.event.set()
            return True

    def is_active(self, run_id: str) -> bool:
        with self._lock:
            return run_id in self._cancel_events

    def reset(self) -> None:
        with self._lock:
            for cancel_event in self._cancel_events.values():
                cancel_event.set()
            for waiter in self._approval_waiters.values():
                waiter.approved = False
                waiter.reason = "Runtime reset"
                waiter.event.set()
            self._cancel_events.clear()
            self._steering_messages.clear()
            self._approval_waiters.clear()
            self._threads.clear()
            self.prompt_cache.clear()

    def _request_approval(
        self,
        job: RunJob,
        cancel_event: Event,
        action: ActionIR,
        descriptor: ToolDescriptor,
        preview: ToolResult | None,
    ) -> ToolApprovalDecision:
        approval_id = f"appr-{uuid4().hex[:12]}"
        approval = ApprovalRequest(
            approval_id=approval_id,
            run_id=job.run.run_id,
            action_id=action.action_id or f"action-{uuid4().hex[:8]}",
            risk=descriptor.risk.value,
            effect=descriptor.effect,
            reason=action.rationale,
            target={
                "tool": action.type,
                "patch": action.params.get("patch", ""),
                "command": redact_secrets(str(action.params.get("command", ""))),
                "files": [],
                "additions": 0,
                "deletions": 0,
                **(preview.metadata if preview is not None else {}),
            },
            options=["approve_once", "deny"],
        )
        waiter = ApprovalWaiter(run_id=job.run.run_id)
        with self._lock:
            self._approval_waiters[approval_id] = waiter

        self._save_checkpoint(job, f"before-approval-{approval_id}")
        transition_run(job.run, RunPhase.WAITING_APPROVAL)
        job.tracer.event(
            job.run.run_id,
            "approval.requested",
            {"phase": job.run.status.value, "approval": approval.to_dict()},
        )
        job.tracer.event(job.run.run_id, "run.transitioned", {"status": job.run.status.value})
        job.on_state_changed(job.run, None)
        job.on_approval_requested(approval)
        if job.artifacts is not None and action.type == "apply_patch":
            job.artifacts.diff_summary.status = "Awaiting approval"
            job.artifacts.diff_summary.files = len(approval.target.get("files", []))
            job.artifacts.diff_summary.insertions = int(approval.target.get("additions", 0))
            job.artifacts.diff_summary.deletions = int(approval.target.get("deletions", 0))
            _set_plan_state(job.artifacts, "inspect", "done")
            _set_plan_state(job.artifacts, "patch", "active")

        while not waiter.event.wait(0.1):
            if cancel_event.is_set():
                waiter.approved = False
                waiter.reason = "Run cancelled while waiting for approval"
                break

        with self._lock:
            self._approval_waiters.pop(approval_id, None)
        job.on_approval_resolved(approval_id)

        if cancel_event.is_set():
            job.tracer.event(
                job.run.run_id,
                "approval.cancelled",
                {"approval_id": approval_id},
            )
            return ToolApprovalDecision(
                approved=False,
                reason=waiter.reason,
                metadata={"approval_id": approval_id},
            )

        if waiter.approved:
            checkpoint_id = f"before-apply-{uuid4().hex[:10]}"
            self._save_checkpoint(job, checkpoint_id)
            job.tracer.event(
                job.run.run_id,
                "approval.resolved",
                {"approval_id": approval_id, "decision": "approve_once"},
            )
            if action.type == "apply_patch":
                summary = PatchSummary(
                    files=list(preview.metadata.get("files", [])) if preview is not None else [],
                    additions=int(preview.metadata.get("additions", 0)) if preview is not None else 0,
                    deletions=int(preview.metadata.get("deletions", 0)) if preview is not None else 0,
                )
                snapshot_dir = job.workspace / "runs" / job.run.run_id / "snapshots" / checkpoint_id
                manifest_path = PatchPipeline(job.workspace).snapshot(summary, snapshot_dir)
                transition_run(job.run, RunPhase.APPLYING_PATCH)
                job.tracer.event(
                    job.run.run_id,
                    "patch.snapshot.created",
                    {"checkpoint_id": checkpoint_id, "manifest_path": str(manifest_path)},
                )
            else:
                transition_run(job.run, RunPhase.RUNNING)
            job.tracer.event(job.run.run_id, "run.transitioned", {"status": job.run.status.value})
            job.on_state_changed(job.run, None)
            return ToolApprovalDecision(
                approved=True,
                metadata={"approval_id": approval_id, "checkpoint_id": checkpoint_id},
            )

        transition_run(job.run, RunPhase.REPAIRING)
        job.tracer.event(
            job.run.run_id,
            "approval.resolved",
            {"approval_id": approval_id, "decision": "deny", "reason": waiter.reason},
        )
        job.tracer.event(job.run.run_id, "run.transitioned", {"status": job.run.status.value})
        job.on_state_changed(job.run, None)
        return ToolApprovalDecision(
            approved=False,
            reason=waiter.reason or "User denied the patch",
            metadata={"approval_id": approval_id},
        )

    def _save_checkpoint(self, job: RunJob, checkpoint_id: str) -> None:
        job.run.last_checkpoint_id = checkpoint_id
        checkpoint = Checkpoint(
            checkpoint_id=checkpoint_id,
            run_id=job.run.run_id,
            step=job.run.current_step,
            status=job.run.status,
            run_state=job.run.to_dict(),
            context_summary=", ".join(job.context_pack.selected_items),
            memory_snapshot={"refs": list(job.run.memory_refs)},
            changed_files=list(job.run.changed_files),
            trace_offset=len(job.tracer.read_events(job.run.run_id)),
        )
        path = CheckpointStore(job.workspace / "runs").save(checkpoint)
        job.tracer.event(
            job.run.run_id,
            "checkpoint.saved",
            {"checkpoint_id": checkpoint_id, "path": str(path)},
        )

    def _record_tool_result(self, job: RunJob, action: ActionIR, result: ToolResult) -> None:
        if action.type == "apply_patch":
            if result.ok:
                files = [str(path) for path in result.metadata.get("files", [])]
                job.run.changed_files = files
                job.run.applied_patches += 1
                try:
                    normalized_patch = PatchPipeline(job.workspace).normalize(str(action.params.get("patch", "")))
                    patch_path = RunArtifactWriter(job.workspace, job.run.run_id).append_patch(
                        normalized_patch,
                        job.run.applied_patches,
                    )
                    diff_item = set_current_diff_item(
                        job.context_pack,
                        step=job.run.current_step,
                        content=redact_secrets(normalized_patch),
                    )
                    job.tracer.event(
                        job.run.run_id,
                        "patch.artifact.saved",
                        {"path": str(patch_path), "sequence": job.run.applied_patches},
                    )
                    job.tracer.event(
                        job.run.run_id,
                        "context.diff_updated",
                        {"item_id": diff_item.id, "tokens": diff_item.tokens, "step": job.run.current_step},
                    )
                except (OSError, ValueError) as exc:
                    job.tracer.event(
                        job.run.run_id,
                        "artifact.failed",
                        {"artifact": "patch.diff", "error": redact_secrets(str(exc))},
                    )
                if job.artifacts is not None:
                    job.artifacts.diff_summary.status = "Applied"
                    job.artifacts.diff_summary.files = len(files)
                    job.artifacts.diff_summary.insertions = int(result.metadata.get("additions", 0))
                    job.artifacts.diff_summary.deletions = int(result.metadata.get("deletions", 0))
                    _set_plan_state(job.artifacts, "patch", "done")
                    _set_plan_state(job.artifacts, "test", "active")
                transition_run(job.run, RunPhase.TESTING)
            else:
                if job.artifacts is not None:
                    _set_plan_state(job.artifacts, "inspect", "done")
                    _set_plan_state(job.artifacts, "patch", "failed", result.error or "Patch validation failed")
                transition_run(job.run, RunPhase.REPAIRING)
            job.tracer.event(job.run.run_id, "run.transitioned", {"status": job.run.status.value})
        elif action.type == "run_test":
            job.run.test_status = "Passed" if result.ok else "Failed"
            if job.run.status in {RunPhase.RUNNING, RunPhase.REPAIRING}:
                transition_run(job.run, RunPhase.TESTING)
            if job.artifacts is not None:
                passed, failed = _test_counts(result.output, ok=result.ok)
                job.artifacts.test_summary.status = "Passed" if result.ok else "Failed"
                job.artifacts.test_summary.command = str(result.metadata.get("command", "Not selected"))
                job.artifacts.test_summary.passed = passed
                job.artifacts.test_summary.failed = failed
                _set_plan_state(job.artifacts, "test", "done" if result.ok else "active")
            if not result.ok and job.run.status == RunPhase.TESTING:
                transition_run(job.run, RunPhase.REPAIRING)
                job.run.repair_attempts += 1
                job.run.repair_status = "active"
                job.tracer.event(
                    job.run.run_id,
                    "repair.started",
                    {
                        "attempt": job.run.repair_attempts,
                        "command": result.metadata.get("command", "Not selected"),
                        "failed": job.artifacts.test_summary.failed if job.artifacts is not None else 0,
                    },
                )
            elif result.ok and job.run.repair_status == "active":
                job.run.repair_status = "completed"
                job.tracer.event(
                    job.run.run_id,
                    "repair.completed",
                    {"attempt": job.run.repair_attempts},
                )
            job.tracer.event(job.run.run_id, "run.transitioned", {"status": job.run.status.value})

        job.on_state_changed(job.run, None)
        self._update_context_from_result(job, action, result)

    @staticmethod
    def _record_policy_evaluation(job: RunJob, evaluation: PolicyEvaluation) -> None:
        job.tracer.event(
            job.run.run_id,
            "policy.evaluated",
            {"evaluation": evaluation.to_dict()},
        )
        if job.artifacts is None or evaluation.tool != "apply_patch" or evaluation.outcome == "allowed":
            return
        detail = evaluation.decisions[-1].reason if evaluation.decisions else "Patch validation failed"
        _set_plan_state(job.artifacts, "inspect", "done")
        _set_plan_state(job.artifacts, "patch", "failed", detail)

    @staticmethod
    def _update_context_from_result(job: RunJob, action: ActionIR, result: ToolResult) -> None:
        content = redact_secrets(result.output or result.error or "No tool output")
        item = add_observation_item(
            job.context_pack,
            step=job.run.current_step,
            action_type=action.type,
            content=content,
            ok=result.ok,
        )
        compaction = compact_context_pack(job.context_pack)
        if job.artifacts is not None:
            job.artifacts.context_explanation = explain_context_items(job.context_pack.items, job.context_pack)
        job.tracer.event(
            job.run.run_id,
            "context.observation_added",
            {"item_id": item.id, "type": item.type, "tokens": item.tokens, "ok": result.ok},
        )
        if compaction.status == "compacted":
            job.tracer.event(job.run.run_id, "context.compacted", {**compaction.to_dict(), "trigger": "automatic"})
        elif compaction.confirmation_required:
            job.tracer.event(
                job.run.run_id,
                "context.compaction_required",
                {**compaction.to_dict(), "trigger": "automatic"},
            )

    @staticmethod
    def _consolidate_memory(job: RunJob, result: RunLoopResult) -> None:
        try:
            entry = consolidate_run_memory(MemoryStore(job.workspace), job.run, result, job.artifacts)
            if entry.memory_id not in job.run.memory_refs:
                job.run.memory_refs.append(entry.memory_id)
            job.tracer.event(
                job.run.run_id,
                "memory.written",
                {"memory_id": entry.memory_id, "scope": entry.scope.value, "kind": entry.kind, "automatic": True},
            )
        except (MemoryStoreError, OSError) as exc:
            job.tracer.event(
                job.run.run_id,
                "memory.failed",
                {"scope": "project", "error": redact_secrets(str(exc))},
            )

    @staticmethod
    def _write_final_report(job: RunJob, result: RunLoopResult) -> None:
        try:
            writer = RunArtifactWriter(job.workspace, job.run.run_id)
            report_path = writer.write_report(
                run=job.run,
                contract=job.contract,
                context_pack=job.context_pack,
                artifacts=job.artifacts,
                result=result,
                trace_events=job.tracer.read_events(job.run.run_id),
            )
            if job.artifacts is not None:
                _set_plan_state(job.artifacts, "report", "done")
            job.tracer.event(
                job.run.run_id,
                "report.generated",
                {
                    "path": str(report_path),
                    "patch_available": writer.patch_path.exists(),
                    "patch_count": job.run.applied_patches,
                },
            )
        except (OSError, ValueError) as exc:
            if job.artifacts is not None:
                _set_plan_state(job.artifacts, "report", "failed", "Report generation failed")
            job.tracer.event(
                job.run.run_id,
                "report.failed",
                {"error": redact_secrets(str(exc))},
            )

    @staticmethod
    def _finalize_plan(job: RunJob, result: RunLoopResult) -> None:
        if job.artifacts is None:
            return

        terminal_state = {
            RunPhase.COMPLETED: "skipped",
            RunPhase.FAILED: "failed",
            RunPhase.CANCELLED: "cancelled",
        }.get(result.status, "skipped")
        for step in job.artifacts.plan:
            if step.id == "report" or step.state == "done":
                continue
            if step.state == "active":
                step.state = terminal_state
                step.detail = result.termination_reason
            elif step.state == "waiting":
                step.state = "skipped" if result.status != RunPhase.CANCELLED else "cancelled"

    @staticmethod
    def _set_result_status(run: RunState, status: RunPhase) -> None:
        try:
            transition_run(run, status)
        except InvalidRunTransition:
            run.status = status

    @staticmethod
    def _record_result_data(run: RunState, result: RunLoopResult) -> None:
        run.current_step = result.steps
        run.budget = {
            "model_calls": result.model_calls,
            "model_cache_hits": result.model_cache_hits,
            "tool_calls": result.tool_calls,
            **result.token_usage,
        }
        run.last_observation = (
            result.observations[-1].to_dict() if result.observations else {}
        )


def _test_counts(output: str, *, ok: bool) -> tuple[int, int]:
    passed_match = re.search(r"(\d+)\s+passed", output)
    failed_match = re.search(r"(\d+)\s+failed", output)
    passed = int(passed_match.group(1)) if passed_match else 0
    failed = int(failed_match.group(1)) if failed_match else 0
    if passed or failed:
        return passed, failed

    unittest_match = re.search(r"Ran\s+(\d+)\s+tests?", output)
    total = int(unittest_match.group(1)) if unittest_match else 0
    return (total, 0) if ok else (0, total)


def _set_plan_state(artifacts: RunArtifacts, step_id: str, state: str, detail: str | None = None) -> None:
    for step in artifacts.plan:
        if step.id == step_id:
            step.state = state
            if detail is not None:
                step.detail = detail
            return
