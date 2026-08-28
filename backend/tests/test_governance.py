from pathlib import Path

import pytest

from app.models import ActionIR, GovernanceSettings, SandboxProfile
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.sandbox import SandboxExecutor, SandboxViolation
from app.tools import ToolGateway, ToolPolicyDenied, create_builtin_tool_registry


ROOT = Path(__file__).resolve().parents[2]


def make_gateway(
    workspace: Path,
    *,
    governance: GovernanceSettings | None = None,
) -> tuple[ToolGateway, list]:
    evaluations = []
    settings = governance or GovernanceSettings()
    sandbox = SandboxExecutor(workspace, "run-governance", profile=settings.sandbox_profile)
    gateway = ToolGateway(
        workspace_root=workspace,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        governance=settings,
        sandbox_validator=sandbox.validate_argv,
        policy_handler=evaluations.append,
        run_id="run-governance",
    )
    for descriptor, handler, preflight in create_builtin_tool_registry(workspace, sandbox):
        gateway.register(descriptor, handler, preflight)
    return gateway, evaluations


def test_gateway_records_ordered_guard_decisions(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("print('ok')\n", encoding="utf-8")
    gateway, evaluations = make_gateway(tmp_path)

    result = gateway.call(ActionIR(type="read_file", rationale="inspect", params={"path": "app.py"}))

    evaluation = evaluations[0]
    assert result.metadata["policy_evaluation_id"] == evaluation.evaluation_id
    assert evaluation.outcome == "allowed"
    assert [decision.guard for decision in evaluation.decisions] == [
        "effect_guard",
        "budget_guard",
        "schema_guard",
        "path_guard",
        "command_guard",
        "tool_policy_guard",
        "preflight_guard",
        "approval_guard",
        "sandbox_guard",
    ]
    assert evaluation.decisions[3].status.value == "allow"
    assert evaluation.decisions[-1].status.value == "skipped"


def test_tool_override_denies_before_handler(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("private\n", encoding="utf-8")
    gateway, evaluations = make_gateway(
        tmp_path,
        governance=GovernanceSettings(tool_overrides={"read_file": "deny"}),
    )

    with pytest.raises(ToolPolicyDenied, match="run override"):
        gateway.call(ActionIR(type="read_file", rationale="inspect", params={"path": "app.py"}))

    assert evaluations[0].outcome == "denied"
    assert evaluations[0].decisions[-1].guard == "tool_policy_guard"
    assert evaluations[0].decisions[-1].status.value == "deny"


def test_agent_contract_policy_cannot_be_weakened_by_run_settings(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("private\n", encoding="utf-8")
    gateway, evaluations = make_gateway(tmp_path)
    gateway.contract.policies.read_file = "deny"

    with pytest.raises(ToolPolicyDenied, match="AgentContract"):
        gateway.call(ActionIR(type="read_file", rationale="inspect", params={"path": "app.py"}))

    assert evaluations[0].effective_policy == "inherit"
    assert evaluations[0].outcome == "denied"


def test_sandbox_filters_daemon_secrets_and_sets_private_home(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "must-not-enter-sandbox")
    sandbox = SandboxExecutor(tmp_path, "run-env")

    execution, output = sandbox.run(
        [
            "python3",
            "-c",
            "import os; print(os.getenv('DEEPSEEK_API_KEY', 'missing')); print(os.environ['HOME'])",
        ],
        timeout_seconds=5,
    )

    assert execution.returncode == 0
    assert "must-not-enter-sandbox" not in output
    assert "missing" in output
    assert str(tmp_path / ".agent" / "sandboxes" / "run-env") in output


def test_strict_sandbox_rejects_obvious_network_command(tmp_path: Path) -> None:
    sandbox = SandboxExecutor(tmp_path, "run-strict", profile=SandboxProfile.STRICT)

    with pytest.raises(SandboxViolation, match="network-capable"):
        sandbox.validate_argv(["python3", "-c", "import requests; requests.get('https://example.com')"])


def test_sandbox_bounds_output_and_timeout(tmp_path: Path) -> None:
    sandbox = SandboxExecutor(tmp_path, "run-limits", profile=SandboxProfile.STRICT)
    truncated, output = sandbox.run(
        ["python3", "-c", "print('x' * 15000)"],
        timeout_seconds=5,
    )
    timed_out, _ = sandbox.run(
        ["python3", "-c", "import time; time.sleep(2)"],
        timeout_seconds=1,
    )

    assert truncated.output_truncated is True
    assert len(output) < 13000
    assert timed_out.timed_out is True
    assert timed_out.termination_reason == "timeout"


def test_sandbox_capabilities_do_not_overclaim_kernel_isolation() -> None:
    capabilities = SandboxExecutor.capabilities()

    assert capabilities.backend == "portable-process"
    assert "sanitized environment" in capabilities.guarantees
    assert "bounded returned output" in capabilities.guarantees
    assert "no kernel-level network namespace" in capabilities.limitations
