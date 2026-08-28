from pathlib import Path

import pytest

from app.models import ActionIR
from app.runtime.action_parser import ActionParseError
from app.runtime.action_executor import ActionExecutor
from app.runtime.agent_loop import execute_next_model_action
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_client import StaticModelClient
from app.runtime.planner import plan_next_action
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway, create_builtin_tool_registry


ROOT = Path(__file__).resolve().parents[2]


def make_gateway(workspace: Path) -> ToolGateway:
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml")
    gateway = ToolGateway(workspace_root=workspace, contract=contract)
    for descriptor, handler, preflight in create_builtin_tool_registry(workspace):
        gateway.register(descriptor, handler, preflight)
    return gateway


def test_planner_parses_static_model_action(tmp_path: Path) -> None:
    gateway = make_gateway(tmp_path)
    tracer = TraceWriter(tmp_path / "runs")
    contract = gateway.contract
    client = StaticModelClient(
        '{"type":"search_code","rationale":"find calculator implementation","params":{"query":"def add"}}'
    )

    decision = plan_next_action(
        run_id="run-001",
        task="fix add",
        contract=contract,
        tools=gateway.list_tools(),
        model_client=client,
        tracer=tracer,
    )

    events = tracer.read_events("run-001")
    assert decision.action.type == "search_code"
    assert [event["event"] for event in events] == ["model.requested", "model.responded"]


def test_planner_rejects_free_form_model_output(tmp_path: Path) -> None:
    gateway = make_gateway(tmp_path)
    tracer = TraceWriter(tmp_path / "runs")
    client = StaticModelClient("please read app.py")

    with pytest.raises(ActionParseError):
        plan_next_action(
            run_id="run-001",
            task="inspect",
            contract=gateway.contract,
            tools=gateway.list_tools(),
            model_client=client,
            tracer=tracer,
        )

    assert [event["event"] for event in tracer.read_events("run-001")] == [
        "model.requested",
        "model.responded",
        "action.rejected",
    ]


def test_action_executor_runs_allowed_tool_and_traces_result(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("def add(a, b):\n    return a + b\n", encoding="utf-8")
    gateway = make_gateway(tmp_path)
    tracer = TraceWriter(tmp_path / "runs")
    executor = ActionExecutor(gateway=gateway, tracer=tracer, run_id="run-001")

    execution = executor.execute(ActionIR(type="read_file", rationale="inspect", params={"path": "app.py"}))

    events = tracer.read_events("run-001")
    assert execution.result.ok is True
    assert "return a + b" in execution.result.output
    assert [event["event"] for event in events] == ["action.parsed", "tool.executed"]


def test_action_executor_returns_failed_result_for_blocked_tool(tmp_path: Path) -> None:
    gateway = make_gateway(tmp_path)
    tracer = TraceWriter(tmp_path / "runs")
    executor = ActionExecutor(gateway=gateway, tracer=tracer, run_id="run-001")

    execution = executor.execute(ActionIR(type="missing_tool", rationale="try invalid tool", params={}))

    events = tracer.read_events("run-001")
    assert execution.result.ok is False
    assert execution.result.metadata["error_type"] == "ToolNotFound"
    assert [event["event"] for event in events] == ["action.parsed", "action.rejected"]


def test_execute_next_model_action_runs_planner_and_executor(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("print('ok')\n", encoding="utf-8")
    gateway = make_gateway(tmp_path)
    tracer = TraceWriter(tmp_path / "runs")
    client = StaticModelClient('{"type":"read_file","rationale":"inspect app","params":{"path":"app.py"}}')

    execution = execute_next_model_action(
        run_id="run-001",
        task="inspect app",
        contract=gateway.contract,
        gateway=gateway,
        model_client=client,
        tracer=tracer,
    )

    events = tracer.read_events("run-001")
    assert execution.result.ok is True
    assert [event["event"] for event in events] == [
        "model.requested",
        "model.responded",
        "action.parsed",
        "tool.executed",
    ]
