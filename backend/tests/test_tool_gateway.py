from pathlib import Path

import pytest

from app.guards import BudgetExceeded, DangerousCommand, PathEscape, check_command, redact_secrets, resolve_workspace_path
from app.models import ActionIR
from app.runtime.contract_compiler import compile_agent_contract
from app.tools import PatchPipeline, ToolGateway, create_builtin_tool_registry


ROOT = Path(__file__).resolve().parents[2]


def make_gateway(workspace: Path) -> ToolGateway:
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml")
    gateway = ToolGateway(workspace_root=workspace, contract=contract)
    for descriptor, handler in create_builtin_tool_registry(workspace):
        gateway.register(descriptor, handler)
    return gateway


def test_registers_builtin_tools(tmp_path: Path) -> None:
    gateway = make_gateway(tmp_path)

    assert [tool.name for tool in gateway.list_tools()] == ["read_file", "search_code", "run_test"]


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

