from pathlib import Path

from app.runtime.agent_loop import execute_agent_run
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_client import ModelMessage, ModelRequest, ModelResponse, QueuedStaticModelClient
from app.runtime.prompt_cache import PromptCache
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway, create_builtin_tool_registry


ROOT = Path(__file__).resolve().parents[2]


def _request(content: str = "inspect") -> ModelRequest:
    return ModelRequest(messages=[ModelMessage(role="user", content=content)])


def _response(action_type: str = "read_file") -> ModelResponse:
    return ModelResponse(
        content=f'{{"type":"{action_type}","rationale":"inspect","params":{{"path":"app.py"}}}}',
        model="test",
        usage={"prompt_tokens": 4, "completion_tokens": 3},
    )


def _gateway(workspace: Path) -> ToolGateway:
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml")
    gateway = ToolGateway(workspace_root=workspace, contract=contract)
    for descriptor, handler, preflight in create_builtin_tool_registry(workspace):
        gateway.register(descriptor, handler, preflight)
    return gateway


def test_prompt_cache_is_bounded_and_expires_entries() -> None:
    now = [100.0]
    cache = PromptCache(max_entries=1, ttl_seconds=10, clock=lambda: now[0])
    first = _request("first")
    second = _request("second")

    cache.put(first, _response(), "read_file")
    cache.put(second, _response(), "read_file")

    assert cache.get(first) is None
    assert cache.get(second) is not None
    now[0] = 111.0
    assert cache.get(second) is None


def test_prompt_cache_rejects_side_effecting_actions() -> None:
    cache = PromptCache()

    assert cache.put(_request(), _response("apply_patch"), "apply_patch") is None
    assert len(cache) == 0


def test_agent_loop_reuses_only_the_read_only_planning_turn(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("print('ready')\n", encoding="utf-8")
    cache = PromptCache()
    read_action = '{"type":"read_file","rationale":"inspect","params":{"path":"app.py"}}'
    finish_action = '{"type":"finish","rationale":"done","params":{"message":"ready"}}'

    first_client = QueuedStaticModelClient([read_action, finish_action])
    first_gateway = _gateway(tmp_path)
    first = execute_agent_run(
        run_id="run-cache-first",
        task="inspect the application",
        contract=first_gateway.contract,
        gateway=first_gateway,
        model_client=first_client,
        tracer=TraceWriter(tmp_path / "runs"),
        prompt_cache=cache,
    )

    second_client = QueuedStaticModelClient([finish_action])
    second_gateway = _gateway(tmp_path)
    second_tracer = TraceWriter(tmp_path / "runs")
    second = execute_agent_run(
        run_id="run-cache-second",
        task="inspect the application",
        contract=second_gateway.contract,
        gateway=second_gateway,
        model_client=second_client,
        tracer=second_tracer,
        prompt_cache=cache,
    )

    assert first.model_cache_hits == 0
    assert second.model_calls == 2
    assert second.model_cache_hits == 1
    assert len(second_client.requests) == 1
    assert second.token_usage["total_tokens"] < first.token_usage["total_tokens"]
    event_names = [event["event"] for event in second_tracer.read_events("run-cache-second")]
    assert "model.cache.hit" in event_names
    assert "model.request.skipped" in event_names
    assert event_names.count("model.requested") == 1
