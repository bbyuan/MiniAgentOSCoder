from __future__ import annotations

import subprocess
from pathlib import Path

from app.guards import check_command, redact_secrets, resolve_workspace_path
from app.models import ApprovalPolicy, RiskLevel, ToolDescriptor, ToolResult


def create_builtin_tool_registry(workspace_root: str | Path) -> list[tuple[ToolDescriptor, object]]:
    workspace = Path(workspace_root)
    return [
        (
            ToolDescriptor(
                name="read_file",
                description="Read a UTF-8 text file inside the workspace.",
                effect="fs.read",
                risk=RiskLevel.LOW,
                approval_policy=ApprovalPolicy.AUTO,
                input_schema={"path": "string"},
            ),
            lambda params: read_file(workspace, params["path"]),
        ),
        (
            ToolDescriptor(
                name="search_code",
                description="Search text files inside the workspace.",
                effect="fs.read",
                risk=RiskLevel.LOW,
                approval_policy=ApprovalPolicy.AUTO,
                input_schema={"query": "string"},
            ),
            lambda params: search_code(workspace, params["query"]),
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
            ),
            lambda params: run_test(workspace, params["command"]),
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
    ignored = {".git", ".venv", "node_modules", "dist", "__pycache__"}
    for path in workspace_root.rglob("*"):
        if any(part in ignored for part in path.parts):
            continue
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if query in text:
            relative = path.relative_to(workspace_root)
            matches.append(str(relative))
    return ToolResult(ok=True, tool="search_code", output="\n".join(matches), metadata={"matches": matches})


def run_test(workspace_root: Path, command: str) -> ToolResult:
    tokens = check_command(command, allowed_prefixes=["python", "python3", "pytest", "npm"])
    completed = subprocess.run(
        tokens,
        cwd=workspace_root,
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )
    output = "\n".join(part for part in [completed.stdout, completed.stderr] if part)
    return ToolResult(
        ok=completed.returncode == 0,
        tool="run_test",
        output=redact_secrets(output),
        metadata={"returncode": completed.returncode, "command": command},
    )

