from __future__ import annotations

from dataclasses import dataclass

from app.guards import redact_secrets
from app.models import ActionIR, HookEvent, HookFailurePolicy, HookManifest, ToolDescriptor, ToolResult
from app.runtime.sandbox import SandboxExecutor
from app.runtime.tracer import TraceWriter


class HookBlocked(RuntimeError):
    pass


@dataclass
class HookPipeline:
    run_id: str
    hooks: list[HookManifest]
    sandbox: SandboxExecutor
    tracer: TraceWriter

    def execute(
        self,
        event: HookEvent,
        *,
        action: ActionIR | None = None,
        descriptor: ToolDescriptor | None = None,
        result: ToolResult | None = None,
    ) -> None:
        for hook in self.hooks:
            if hook.event != event:
                continue
            payload = {
                "hook_id": hook.id,
                "name": hook.name,
                "event": event.value,
                "failure_policy": hook.failure_policy.value,
                "tool": descriptor.name if descriptor is not None else None,
                "action_id": action.action_id if action is not None else None,
            }
            self.tracer.event(self.run_id, "hook.started", payload)
            try:
                execution, output = self.sandbox.run(
                    hook.command,
                    timeout_seconds=hook.timeout_seconds,
                    extra_env={
                        "MINIAGENTOS_EVENT": event.value,
                        "MINIAGENTOS_RUN_ID": self.run_id,
                        "MINIAGENTOS_TOOL": descriptor.name if descriptor is not None else "",
                        "MINIAGENTOS_ACTION_ID": action.action_id if action is not None and action.action_id else "",
                        "MINIAGENTOS_TOOL_OK": str(result.ok).lower() if result is not None else "",
                    },
                )
                ok = execution.returncode == 0 and not execution.timed_out
                finished = {
                    "ok": ok,
                    "returncode": execution.returncode,
                    "duration_ms": execution.duration_ms,
                    "sandbox_id": execution.sandbox_id,
                    "timed_out": execution.timed_out,
                    "output": redact_secrets(output[:1000]),
                }
            except Exception as exc:
                ok = False
                finished = {"ok": False, "error": redact_secrets(str(exc))}
            self.tracer.event(
                self.run_id,
                "hook.finished",
                {
                    **payload,
                    **finished,
                },
            )
            if not ok and hook.failure_policy == HookFailurePolicy.BLOCK and event.value.endswith(".before"):
                raise HookBlocked(f"Blocking hook failed: {hook.id}")
