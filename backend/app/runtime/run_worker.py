from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from threading import Event, Lock

from app.guards import redact_secrets
from app.models import AgentContract, ContextPack, RunLoopResult, RunPhase, RunState
from app.runtime.model_client import ModelClient
from app.runtime.run_loop import AgentRunLoop
from app.runtime.state_machine import InvalidRunTransition, transition_run
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway, create_builtin_tool_registry


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


@dataclass
class RunWorker:
    _cancel_events: dict[str, Event] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def prepare(self, job: RunJob) -> None:
        with self._lock:
            if job.run.run_id in self._cancel_events:
                raise RunWorkerConflict("Run is already active")
            if job.run.status != RunPhase.PLANNING:
                raise RunWorkerConflict(f"Run cannot start from status: {job.run.status.value}")
            self._cancel_events[job.run.run_id] = Event()

        transition_run(job.run, RunPhase.RUNNING)
        job.tracer.event(job.run.run_id, "run.transitioned", {"status": RunPhase.RUNNING.value})

    def execute(self, job: RunJob) -> RunLoopResult:
        cancel_event = self._cancel_events.get(job.run.run_id)
        if cancel_event is None:
            raise RunWorkerConflict("Run was not prepared")

        try:
            try:
                gateway = ToolGateway(workspace_root=job.workspace, contract=job.contract)
                for descriptor, handler in create_builtin_tool_registry(job.workspace):
                    gateway.register(descriptor, handler)

                result = AgentRunLoop(
                    run_id=job.run.run_id,
                    gateway=gateway,
                    model_client=job.model_client,
                    tracer=job.tracer,
                    should_cancel=cancel_event.is_set,
                ).run(
                    task=job.run.task,
                    contract=job.contract,
                    context_pack=job.context_pack,
                )
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

            job.tracer.event(job.run.run_id, "run.transitioned", {"status": result.status.value})
            self._apply_result(job.run, result)
            job.on_result(result)
            return result
        finally:
            with self._lock:
                self._cancel_events.pop(job.run.run_id, None)

    def cancel(self, run_id: str) -> bool:
        with self._lock:
            cancel_event = self._cancel_events.get(run_id)
            if cancel_event is None:
                return False
            cancel_event.set()
            return True

    def is_active(self, run_id: str) -> bool:
        with self._lock:
            return run_id in self._cancel_events

    def reset(self) -> None:
        with self._lock:
            for cancel_event in self._cancel_events.values():
                cancel_event.set()
            self._cancel_events.clear()

    @staticmethod
    def _apply_result(run: RunState, result: RunLoopResult) -> None:
        try:
            transition_run(run, result.status)
        except InvalidRunTransition:
            run.status = result.status
        run.current_step = result.steps
        run.budget = {
            "model_calls": result.model_calls,
            "tool_calls": result.tool_calls,
            **result.token_usage,
        }
        run.last_observation = (
            result.observations[-1].to_dict() if result.observations else {}
        )
