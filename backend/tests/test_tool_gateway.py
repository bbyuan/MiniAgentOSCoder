from pathlib import Path

import pytest

from app.guards import BudgetExceeded, DangerousCommand, PathEscape, check_command, redact_secrets, resolve_workspace_path
from app.models import ActionIR
from app.runtime.contract_compiler import compile_agent_contract
from app.tools import PatchPipeline, ToolApprovalDecision, ToolGateway, create_builtin_tool_registry


ROOT = Path(__file__).resolve().parents[2]


def make_gateway(workspace: Path) -> ToolGateway:
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml")
    gateway = ToolGateway(workspace_root=workspace, contract=contract)
    for descriptor, handler, preflight in create_builtin_tool_registry(workspace):
        gateway.register(descriptor, handler, preflight)
    return gateway


def test_registers_builtin_tools(tmp_path: Path) -> None:
    gateway = make_gateway(tmp_path)

    assert [tool.name for tool in gateway.list_tools()] == ["read_file", "search_code", "run_test", "apply_patch"]


def test_read_file_tool_redacts_secrets(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("API_KEY=abc123\nprint('ok')\n", encoding="utf-8")
    gateway = make_gateway(tmp_path)

    result = gateway.call(ActionIR(type="read_file", rationale="inspect", params={"path": "app.py"}))

    assert result.ok is True
    assert "[REDACTED_SECRET]" in result.output
    assert "abc123" not in result.output


def test_search_code_returns_matching_files(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "service.py").write_text("def login(): pass\n", encoding="utf-8")
    gateway = make_gateway(tmp_path)

    result = gateway.call(ActionIR(type="search_code", rationale="find login", params={"query": "login"}))

    assert result.ok is True
    assert "src/service.py" in result.output


def test_run_test_tool_executes_allowed_command(tmp_path: Path) -> None:
    gateway = make_gateway(tmp_path)

    result = gateway.call(ActionIR(type="run_test", rationale="smoke", params={"command": "python3 -c \"print('ok')\""}))

    assert result.ok is True
    assert "ok" in result.output


def test_path_guard_blocks_workspace_escape(tmp_path: Path) -> None:
    with pytest.raises(PathEscape):
        resolve_workspace_path(tmp_path, "../secret.txt")


def test_command_guard_blocks_dangerous_command() -> None:
    with pytest.raises(DangerousCommand):
        check_command("rm -rf .")


def test_tool_budget_blocks_extra_calls(tmp_path: Path) -> None:
    gateway = make_gateway(tmp_path)
    gateway.used_tool_calls = gateway.contract.cost_envelope.max_tool_calls

    with pytest.raises(BudgetExceeded):
        gateway.call(ActionIR(type="search_code", rationale="find", params={"query": "x"}))


def test_secret_sensor_redacts_common_patterns() -> None:
    text = "password=hunter2\n-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----"

    redacted = redact_secrets(text)

    assert "hunter2" not in redacted
    assert "PRIVATE KEY" not in redacted


def test_patch_pipeline_summarizes_unified_diff(tmp_path: Path) -> None:
    diff = """--- a/app.py
+++ b/app.py
@@
-old
+new
"""
    summary = PatchPipeline(tmp_path).dry_run(diff)

    assert summary.files == ["app.py"]
    assert summary.additions == 1
    assert summary.deletions == 1


def test_apply_patch_runs_preflight_and_requires_approval(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
"""
    gateway = make_gateway(tmp_path)
    approvals: list[dict[str, object]] = []
    gateway.approval_handler = lambda action, descriptor, preview: (
        approvals.append(preview.metadata if preview is not None else {})
        or ToolApprovalDecision(approved=True, metadata={"approval_id": "appr-test"})
    )

    result = gateway.call(ActionIR(type="apply_patch", rationale="fix", params={"patch": patch}))

    assert result.ok is True
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "new\n"
    assert approvals == [{"preflight": True, "files": ["app.py"], "additions": 1, "deletions": 1}]
    assert result.metadata["approval_id"] == "appr-test"


def test_denied_patch_does_not_modify_workspace(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
"""
    gateway = make_gateway(tmp_path)
    gateway.approval_handler = lambda action, descriptor, preview: ToolApprovalDecision(
        approved=False,
        reason="not this change",
    )

    result = gateway.call(ActionIR(type="apply_patch", rationale="fix", params={"patch": patch}))

    assert result.ok is False
    assert result.metadata["approval_denied"] is True
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "old\n"


@pytest.mark.parametrize("target", ["../outside.py", ".env", ".agent/config.yaml", "runs/trace.jsonl"])
def test_patch_preflight_rejects_unsafe_targets(tmp_path: Path, target: str) -> None:
    patch = f"""--- /dev/null
+++ b/{target}
@@ -0,0 +1 @@
+unsafe
"""
    gateway = make_gateway(tmp_path)
    gateway.approval_handler = lambda action, descriptor, preview: pytest.fail("approval must not be requested")

    result = gateway.call(ActionIR(type="apply_patch", rationale="unsafe", params={"patch": patch}))

    assert result.ok is False
    assert not (tmp_path / target).exists()


def test_patch_snapshot_preserves_original_file(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    pipeline = PatchPipeline(tmp_path)
    summary = pipeline.summarize("""--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
""")

    manifest = pipeline.snapshot(summary, tmp_path / "runs" / "run-test" / "snapshots" / "before")

    assert (manifest.parent / "app.py").read_text(encoding="utf-8") == "old\n"
    assert '"app.py": true' in manifest.read_text(encoding="utf-8")
