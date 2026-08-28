from pathlib import Path
from threading import Event

from app.models import RunPhase
from app.runtime.agent_loop import execute_agent_run
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_client import QueuedStaticModelClient
from app.runtime.run_loop import AgentRunLoop
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway, create_builtin_tool_registry


ROOT = Path(__file__).resolve().parents[2]


def make_gateway(workspace: Path) -> ToolGateway:
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml")
    gateway = ToolGateway(workspace_root=workspace, contract=contract)
    for descriptor, handler, preflight in create_builtin_tool_registry(workspace):
        gateway.register(descriptor, handler, preflight)
    return gateway


def run_loop(
    tmp_path: Path,
    client: QueuedStaticModelClient,
    *,
    run_id: str = "run-loop-001",
):
    gateway = make_gateway(tmp_path)
    tracer = TraceWriter(tmp_path / "runs")
    result = execute_agent_run(
        run_id=run_id,
        task="inspect the application",
        contract=gateway.contract,
        gateway=gateway,
        model_client=client,
        tracer=tracer,
    )
    return result, gateway, tracer


def test_run_loop_executes_tool_then_finishes_with_observation_feedback(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("print('ready')\n", encoding="utf-8")
    client = QueuedStaticModelClient(
        [
            '{"type":"read_file","rationale":"inspect app","params":{"path":"app.py"}}',
            '{"type":"finish","rationale":"inspection complete","params":{"message":"The app is ready."}}',
        ]
    )

    result, _, tracer = run_loop(tmp_path, client)

    assert result.status == RunPhase.COMPLETED
    assert result.termination_reason == "finish"
    assert result.steps == 2
    assert result.model_calls == 2
    assert result.tool_calls == 1
    assert result.final_message == "The app is ready."
    assert result.observations[0].output == "print('ready')\n"
    assert '"action_type": "read_file"' in client.requests[1].messages[1].content
    assert "print('ready')" in client.requests[1].messages[1].content
    assert tracer.read_events("run-loop-001")[-1]["event"] == "run.finished"


def test_run_loop_allows_recovery_after_rejected_tool(tmp_path: Path) -> None:
    client = QueuedStaticModelClient(
        [
            '{"type":"missing_tool","rationale":"try unavailable tool","params":{}}',
            '{"type":"finish","rationale":"report rejection","params":{"message":"Tool was unavailable."}}',
        ]
    )

    result, _, _ = run_loop(tmp_path, client)

    assert result.status == RunPhase.COMPLETED
    assert result.observations[0].ok is False
    assert result.observations[0].metadata["error_type"] == "ToolNotFound"
    assert "missing_tool" in client.requests[1].messages[1].content


def test_run_loop_stops_at_model_call_budget(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("pass\n", encoding="utf-8")
    client = QueuedStaticModelClient(
        ['{"type":"read_file","rationale":"inspect","params":{"path":"app.py"}}']
    )
    gateway = make_gateway(tmp_path)
    gateway.contract.cost_envelope.max_model_calls = 1
    tracer = TraceWriter(tmp_path / "runs")

    result = execute_agent_run(
        run_id="run-budget-model",
        task="inspect",
        contract=gateway.contract,
        gateway=gateway,
        model_client=client,
        tracer=tracer,
    )

    assert result.status == RunPhase.FAILED
    assert result.termination_reason == "max_model_calls"
    assert result.model_calls == 1
    assert result.tool_calls == 1
    assert tracer.read_events("run-budget-model")[-1]["event"] == "run.budget_exceeded"


def test_run_loop_stops_before_tool_when_token_budget_is_exceeded(tmp_path: Path) -> None:
    client = QueuedStaticModelClient(
        ['{"type":"read_file","rationale":"inspect","params":{"path":"app.py"}}']
    )
    gateway = make_gateway(tmp_path)
    gateway.contract.cost_envelope.max_input_tokens = 1
    tracer = TraceWriter(tmp_path / "runs")

    result = execute_agent_run(
        run_id="run-budget-token",
        task="inspect",
        contract=gateway.contract,
        gateway=gateway,
        model_client=client,
        tracer=tracer,
    )

    assert result.status == RunPhase.FAILED
    assert result.termination_reason == "max_input_tokens"
    assert result.tool_calls == 0
    assert result.observations == []
    assert "action.parsed" not in [event["event"] for event in tracer.read_events("run-budget-token")]


def test_run_loop_fails_on_malformed_action_without_tool_execution(tmp_path: Path) -> None:
    client = QueuedStaticModelClient(["I should inspect app.py first."])

    result, gateway, tracer = run_loop(tmp_path, client, run_id="run-invalid-action")

    assert result.status == RunPhase.FAILED
    assert result.termination_reason == "invalid_action_ir"
    assert result.tool_calls == 0
    assert gateway.used_tool_calls == 0
    events = [event["event"] for event in tracer.read_events("run-invalid-action")]
    assert events[-2:] == ["action.rejected", "run.failed"]


def test_run_loop_stops_when_max_steps_are_used_without_finish(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("pass\n", encoding="utf-8")
    client = QueuedStaticModelClient(
        ['{"type":"read_file","rationale":"inspect","params":{"path":"app.py"}}']
    )
    gateway = make_gateway(tmp_path)
    gateway.contract.program.max_steps = 1
    gateway.contract.cost_envelope.max_steps = 3
    tracer = TraceWriter(tmp_path / "runs")

    result = execute_agent_run(
        run_id="run-budget-step",
        task="inspect",
        contract=gateway.contract,
        gateway=gateway,
        model_client=client,
        tracer=tracer,
    )

    assert result.status == RunPhase.FAILED
    assert result.termination_reason == "max_steps"
    assert result.steps == 1
    assert tracer.read_events("run-budget-step")[-1]["event"] == "run.budget_exceeded"


def test_run_loop_stops_at_tool_call_budget(tmp_path: Path) -> None:
    client = QueuedStaticModelClient(
        ['{"type":"read_file","rationale":"inspect","params":{"path":"app.py"}}']
    )
    gateway = make_gateway(tmp_path)
    gateway.contract.cost_envelope.max_tool_calls = 0
    tracer = TraceWriter(tmp_path / "runs")

    result = execute_agent_run(
        run_id="run-budget-tool",
        task="inspect",
        contract=gateway.contract,
        gateway=gateway,
        model_client=client,
        tracer=tracer,
    )

    assert result.status == RunPhase.FAILED
    assert result.termination_reason == "max_tool_calls"
    assert result.tool_calls == 0
    assert result.observations[0].metadata["error_type"] == "BudgetExceeded"


def test_run_loop_stops_at_wall_time_budget_before_model_call(tmp_path: Path) -> None:
    client = QueuedStaticModelClient(
        ['{"type":"finish","rationale":"done","params":{"message":"done"}}']
    )
    gateway = make_gateway(tmp_path)
    gateway.contract.cost_envelope.max_wall_time_seconds = 10
    tracer = TraceWriter(tmp_path / "runs")
    clock_values = iter([100.0, 111.0])

    result = AgentRunLoop(
        run_id="run-budget-time",
        gateway=gateway,
        model_client=client,
        tracer=tracer,
        clock=lambda: next(clock_values),
    ).run(task="finish", contract=gateway.contract)

    assert result.status == RunPhase.FAILED
    assert result.termination_reason == "max_wall_time_seconds"
    assert result.model_calls == 0
    assert client.requests == []


def test_run_loop_cancels_after_model_response_before_tool_effect(tmp_path: Path) -> None:
    cancel_event = Event()

    class CancellingModelClient:
        def complete(self, request):
            cancel_event.set()
            return QueuedStaticModelClient(
                ['{"type":"read_file","rationale":"inspect","params":{"path":"app.py"}}']
            ).complete(request)

    gateway = make_gateway(tmp_path)
    tracer = TraceWriter(tmp_path / "runs")

    result = AgentRunLoop(
        run_id="run-cancel-after-model",
        gateway=gateway,
        model_client=CancellingModelClient(),
        tracer=tracer,
        should_cancel=cancel_event.is_set,
    ).run(task="inspect", contract=gateway.contract)

    assert result.status == RunPhase.CANCELLED
    assert result.termination_reason == "user_cancelled"
    assert result.model_calls == 1
    assert result.tool_calls == 0
    events = [event["event"] for event in tracer.read_events("run-cancel-after-model")]
    assert events[-1] == "run.cancelled"
    assert "action.parsed" not in events
