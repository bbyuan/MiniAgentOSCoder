from __future__ import annotations

from collections.abc import Callable
import os
from pathlib import Path
import signal
import subprocess
from time import perf_counter
from uuid import uuid4

from app.guards import redact_secrets
from app.models import SandboxCapabilities, SandboxExecution, SandboxProfile


class SandboxViolation(PermissionError):
    pass


SandboxEventHandler = Callable[[str, dict[str, object]], None]


class SandboxExecutor:
    def __init__(
        self,
        workspace: str | Path,
        run_id: str,
        *,
        profile: SandboxProfile = SandboxProfile.STANDARD,
        event_handler: SandboxEventHandler | None = None,
    ) -> None:
        self.workspace = Path(workspace).resolve()
        self.run_id = run_id
        self.profile = profile
        self.event_handler = event_handler

    @staticmethod
    def capabilities() -> SandboxCapabilities:
        return SandboxCapabilities(
            backend="portable-process",
            guarantees=[
                "argv execution without a shell",
                "workspace-scoped current directory",
                "sanitized environment",
                "run-private HOME and TMPDIR",
                "isolated process group",
                "wall-time termination",
                "bounded returned output",
            ],
            limitations=[
                "no kernel-level network namespace",
                "no syscall filtering",
                "no read-only filesystem mount",
            ],
        )

    def validate_argv(self, argv: list[str]) -> None:
        if not argv:
            raise SandboxViolation("Sandbox command must not be empty")
        if self.profile != SandboxProfile.STRICT:
            return
        joined = " ".join(argv).lower()
        blocked = ("http://", "https://", "socket.", "requests.", "urllib.")
        if any(pattern in joined for pattern in blocked):
            raise SandboxViolation("Strict sandbox rejects an obvious network-capable command")

    def run(
        self,
        argv: list[str],
        *,
        timeout_seconds: int,
        extra_env: dict[str, str] | None = None,
    ) -> tuple[SandboxExecution, str]:
        self.validate_argv(argv)
        timeout = min(timeout_seconds, 30 if self.profile == SandboxProfile.STRICT else timeout_seconds)
        output_limit = 12000 if self.profile == SandboxProfile.STRICT else 24000
        sandbox_id = f"sbx-{uuid4().hex[:12]}"
        home, temporary = self._prepare_directories(sandbox_id)
        execution = SandboxExecution(
            sandbox_id=sandbox_id,
            run_id=self.run_id,
            profile=self.profile,
            backend="portable-process",
            executable=Path(argv[0]).name,
            timeout_seconds=timeout,
        )
        self._emit("sandbox.started", execution.to_dict())
        started = perf_counter()
        try:
            process = subprocess.Popen(
                argv,
                cwd=self.workspace,
                env=self._environment(home, temporary, extra_env=extra_env),
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True,
            )
        except OSError as exc:
            execution.duration_ms = round((perf_counter() - started) * 1000, 3)
            execution.termination_reason = "spawn_error"
            self._emit("sandbox.finished", execution.to_dict())
            raise SandboxViolation(f"Sandbox could not start executable: {execution.executable}") from exc
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            execution.timed_out = True
            execution.termination_reason = "timeout"
            self._terminate_process_group(process)
            stdout, stderr = process.communicate()
        execution.returncode = process.returncode
        execution.duration_ms = round((perf_counter() - started) * 1000, 3)
        output = "\n".join(part for part in (stdout, stderr) if part)
        output = redact_secrets(output)
        if len(output) > output_limit:
            output = f"{output[:output_limit]}\n...[sandbox output truncated]"
            execution.output_truncated = True
        self._emit("sandbox.finished", execution.to_dict())
        return execution, output

    def process_environment(
        self,
        namespace: str,
        *,
        extra_env: dict[str, str] | None = None,
        host_env_allow: list[str] | None = None,
    ) -> dict[str, str]:
        home, temporary = self._prepare_directories(namespace)
        return self._environment(
            home,
            temporary,
            extra_env=extra_env,
            host_env_allow=host_env_allow,
        )

    def _prepare_directories(self, sandbox_id: str) -> tuple[Path, Path]:
        agent_dir = self.workspace / ".agent"
        agent_dir.mkdir(parents=True, exist_ok=True)
        if not agent_dir.resolve().is_relative_to(self.workspace):
            raise SandboxViolation("Sandbox directory escapes the workspace")
        root = agent_dir / "sandboxes" / self.run_id / sandbox_id
        home = root / "home"
        temporary = root / "tmp"
        home.mkdir(parents=True, exist_ok=True)
        temporary.mkdir(parents=True, exist_ok=True)
        return home, temporary

    def _environment(
        self,
        home: Path,
        temporary: Path,
        *,
        extra_env: dict[str, str] | None = None,
        host_env_allow: list[str] | None = None,
    ) -> dict[str, str]:
        allowed = {"PATH", "LANG", "LC_ALL"}
        if self.profile == SandboxProfile.STANDARD:
            allowed.update({"CI", "NO_COLOR"})
        allowed.update(host_env_allow or [])
        environment = {key: value for key, value in os.environ.items() if key in allowed}
        environment.update(
            {
                "HOME": str(home),
                "TMPDIR": str(temporary),
                "MINIAGENTOS_SANDBOX": "1",
                "MINIAGENTOS_SANDBOX_PROFILE": self.profile.value,
            }
        )
        for key, value in (extra_env or {}).items():
            if not key.startswith("MINIAGENTOS_"):
                raise SandboxViolation(f"Sandbox extra environment key is not allowed: {key}")
            environment[key] = value
        return environment

    def _emit(self, event: str, payload: dict[str, object]) -> None:
        if self.event_handler is not None:
            self.event_handler(event, payload)

    @staticmethod
    def _terminate_process_group(process: subprocess.Popen[str]) -> None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            return
