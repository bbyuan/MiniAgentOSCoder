from __future__ import annotations

from pathlib import Path
from typing import Callable

from app.guards import check_command, redact_secrets, resolve_workspace_path
from app.models import ApprovalPolicy, RiskLevel, ToolDescriptor, ToolResult
from app.runtime.sandbox import SandboxExecutor
from app.context.workspace_scan import IGNORED_DIRS
from app.tools.patch_pipeline import PatchPipeline, PatchPipelineError


BuiltinToolRegistration = tuple[
    ToolDescriptor,
    Callable[[dict[str, object]], ToolResult],
    Callable[[dict[str, object]], ToolResult] | None,
]


def create_builtin_tool_registry(
    workspace_root: str | Path,
    sandbox: SandboxExecutor | None = None,
) -> list[BuiltinToolRegistration]:
    workspace = Path(workspace_root)
    sandbox_executor = sandbox or SandboxExecutor(workspace, "unmanaged")
    return [
        (
            ToolDescriptor(
                name="read_file",
                description="Read a UTF-8 text file inside the workspace.",
                effect="fs.read",
                risk=RiskLevel.LOW,
                approval_policy=ApprovalPolicy.AUTO,
                input_schema={"path": "string"},
                metadata={"path_params": ["path"], "sandbox": "workspace_read"},
            ),
            lambda params: read_file(workspace, params["path"]),
            None,
        ),
        (
            ToolDescriptor(
                name="search_code",
                description="Search text files inside the workspace.",
                effect="fs.read",
                risk=RiskLevel.LOW,
                approval_policy=ApprovalPolicy.AUTO,
                input_schema={"query": "string"},
                metadata={"sandbox": "workspace_read"},
            ),
            lambda params: search_code(workspace, params["query"]),
            None,
        ),
        (
            ToolDescriptor(
                name="run_test",
                description="Run an allowed test command inside the workspace.",
                effect="test.run",
                risk=RiskLevel.MEDIUM,
                approval_policy=ApprovalPolicy.AUTO,
                input_schema={"command": "string"},
                timeout_seconds=60,
                metadata={
                    "command_param": "command",
                    "allowed_prefixes": ["python", "python3", "pytest", "npm"],
                    "sandbox": "process",
                },
            ),
            lambda params: run_test(workspace, params["command"], sandbox_executor),
            None,
        ),
        (
            ToolDescriptor(
                name="apply_patch",
                description="Apply a unified diff after runtime validation and explicit user approval.",
                effect="fs.write",
                risk=RiskLevel.HIGH,
                approval_policy=ApprovalPolicy.APPROVAL_REQUIRED,
                input_schema={"patch": "string"},
                timeout_seconds=30,
                metadata={"sandbox": "patch_pipeline"},
            ),
            lambda params: apply_patch(workspace, params["patch"]),
            lambda params: preview_patch(workspace, params["patch"]),
        ),
    ]


def read_file(workspace_root: Path, path: str) -> ToolResult:
    resolved = resolve_workspace_path(workspace_root, path)
    if not resolved.is_file():
        return ToolResult(ok=False, tool="read_file", error=f"File not found: {path}")
    content = resolved.read_text(encoding="utf-8")
    return ToolResult(ok=True, tool="read_file", output=redact_secrets(content), metadata={"path": str(resolved)})


def search_code(workspace_root: Path, query: str) -> ToolResult:
    matches: list[str] = []
    for path in workspace_root.rglob("*"):
        relative = path.relative_to(workspace_root)
        if any(part in IGNORED_DIRS for part in relative.parts):
            continue
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if query in text:
            matches.append(str(relative))
    return ToolResult(ok=True, tool="search_code", output="\n".join(matches), metadata={"matches": matches})


def run_test(workspace_root: Path, command: str, sandbox: SandboxExecutor) -> ToolResult:
    tokens = check_command(command, allowed_prefixes=["python", "python3", "pytest", "npm"])
    execution, output = sandbox.run(tokens, timeout_seconds=60)
    return ToolResult(
        ok=execution.returncode == 0 and not execution.timed_out,
        tool="run_test",
        output=output,
        error="Sandbox command timed out" if execution.timed_out else None,
        metadata={
            "returncode": execution.returncode,
            "command": command,
            "sandbox_id": execution.sandbox_id,
            "sandbox_profile": execution.profile.value,
            "output_truncated": execution.output_truncated,
        },
    )


def preview_patch(workspace_root: Path, patch: str) -> ToolResult:
    if redact_secrets(patch) != patch:
        return ToolResult(
            ok=False,
            tool="apply_patch",
            error="Patch contains a potential secret",
            metadata={"preflight": True},
        )
    try:
        pipeline = PatchPipeline(workspace_root)
        normalized_patch = pipeline.normalize(patch)
        summary = pipeline.check_apply(normalized_patch)
    except PatchPipelineError as exc:
        return ToolResult(ok=False, tool="apply_patch", error=str(exc), metadata={"preflight": True})
    return ToolResult(
        ok=True,
        tool="apply_patch",
        output="Patch passed dry-run validation",
        metadata={
            "preflight": True,
            "files": summary.files,
            "additions": summary.additions,
            "deletions": summary.deletions,
        },
    )


def apply_patch(workspace_root: Path, patch: str) -> ToolResult:
    try:
        pipeline = PatchPipeline(workspace_root)
        normalized_patch = pipeline.normalize(patch)
        summary = pipeline.apply(normalized_patch)
    except PatchPipelineError as exc:
        return ToolResult(ok=False, tool="apply_patch", error=str(exc))
    return ToolResult(
        ok=True,
        tool="apply_patch",
        output="Patch applied successfully",
        metadata={
            "files": summary.files,
            "additions": summary.additions,
            "deletions": summary.deletions,
        },
    )
