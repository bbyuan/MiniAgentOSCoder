from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from app.models import AgentContract, RunPhase
from app.runtime.agent_loop import execute_agent_run
from app.runtime.model_client import ModelMessage, ModelRequest
from app.runtime.model_provider import (
    ModelConfigurationError,
    create_model_client,
    create_routed_model_client,
    inspect_model_provider,
    inspect_model_configuration,
    load_model_provider_config,
    load_model_routing_config,
)
from app.runtime.model_routing import build_model_route_plan
from app.runtime.openai_compatible import ModelProviderError, OpenAICompatibleModelClient
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway


@dataclass
class RecordingTransport:
    response: dict[str, Any]
    calls: list[dict[str, Any]] = field(default_factory=list)

    def post_json(
        self,
        *,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
        timeout_seconds: int,
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "url": url,
                "headers": headers,
                "payload": payload,
                "timeout_seconds": timeout_seconds,
            }
        )
        return self.response


def write_model_config(path: Path, *, model: str = "demo-model") -> Path:
    path.write_text(
        "\n".join(
            [
                "models:",
                "  provider: openai-compatible",
                f"  default_model: {model}",
                "  api_key_env: MINIAGENT_TEST_API_KEY",
                "  base_url: https://provider.example/v1",
                "  base_url_env: MINIAGENT_TEST_BASE_URL",
                "  timeout_seconds: 45",
                "  json_mode: true",
                "  max_tokens_field: max_completion_tokens",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return path


def test_model_provider_status_reports_issues_without_secret(tmp_path: Path) -> None:
    config = load_model_provider_config(write_model_config(tmp_path / "config.yaml"))
    secret = "test-secret-must-not-leak"

    missing = inspect_model_provider(config, environ={})
    risky = inspect_model_provider(
        config,
        environ={
            "MINIAGENT_TEST_API_KEY": secret,
            "MINIAGENT_TEST_BASE_URL": "https://user:password@local.example/v1?token=hidden#fragment",
        },
    )
    ready = inspect_model_provider(
        config,
        environ={
            "MINIAGENT_TEST_API_KEY": secret,
            "MINIAGENT_TEST_BASE_URL": "https://local.example/v1",
        },
    )

    assert missing.configured is False
    assert missing.issues == ["missing_environment_variable:MINIAGENT_TEST_API_KEY"]
    assert risky.configured is False
    assert risky.issues == ["invalid_base_url"]
    assert risky.base_url == "https://local.example/v1"
    assert ready.configured is True
    assert ready.base_url == "https://local.example/v1"
    assert secret not in str(ready.to_dict())
    assert "password" not in ready.base_url
    assert "hidden" not in ready.base_url


def test_factory_rejects_missing_configuration_before_transport(tmp_path: Path) -> None:
    transport = RecordingTransport(response={})
    config_path = write_model_config(tmp_path / "config.yaml", model="unset")

    with pytest.raises(ModelConfigurationError) as exc_info:
        create_model_client(config_path, environ={}, transport=transport)

    assert "model_not_configured" in str(exc_info.value)
    assert "missing_environment_variable:MINIAGENT_TEST_API_KEY" in str(exc_info.value)
    assert transport.calls == []


def test_openai_compatible_client_maps_request_and_response(tmp_path: Path) -> None:
    secret = "test-secret-must-not-leak"
    transport = RecordingTransport(
        response={
            "id": "chatcmpl-test",
            "model": "provider-model-v2",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": '{"type":"finish","rationale":"done","params":{"message":"done"}}',
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20},
        }
    )
    client = create_model_client(
        write_model_config(tmp_path / "config.yaml"),
        environ={"MINIAGENT_TEST_API_KEY": secret},
        transport=transport,
    )

    response = client.complete(
        ModelRequest(
            messages=[ModelMessage(role="user", content="Return one action")],
            metadata={"max_output_tokens": 321},
        )
    )

    call = transport.calls[0]
    assert call["url"] == "https://provider.example/v1/chat/completions"
    assert call["headers"]["Authorization"] == f"Bearer {secret}"
    assert call["payload"]["model"] == "demo-model"
    assert call["payload"]["response_format"] == {"type": "json_object"}
    assert call["payload"]["max_completion_tokens"] == 321
    assert call["timeout_seconds"] == 45
    assert response.model == "provider-model-v2"
    assert response.usage["total_tokens"] == 20
    assert response.metadata["finish_reason"] == "stop"
    assert secret not in repr(client)
    assert secret not in str(response.to_dict())


def test_openai_compatible_client_rejects_invalid_response_without_leaking_key() -> None:
    secret = "test-secret-must-not-leak"
    client = OpenAICompatibleModelClient(
        api_key=secret,
        base_url="https://provider.example/v1",
        default_model="demo-model",
        transport=RecordingTransport(response={"error": {"message": secret}}),
    )

    with pytest.raises(ModelProviderError) as exc_info:
        client.complete(ModelRequest(messages=[ModelMessage(role="user", content="act")]))

    assert str(exc_info.value) == "Model provider response is missing choices"
    assert secret not in str(exc_info.value)


def test_model_provider_config_rejects_unsafe_token_field(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        "models:\n  max_tokens_field: arbitrary_payload_key\n",
        encoding="utf-8",
    )

    with pytest.raises(ModelConfigurationError, match="max_tokens_field"):
        load_model_provider_config(config_path)


def test_model_provider_config_accepts_optional_token_prices(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        "models:\n  input_price_per_million: 0.14\n  output_price_per_million: 0.28\n",
        encoding="utf-8",
    )

    config = load_model_provider_config(config_path)

    assert config.input_price_per_million == 0.14
    assert config.output_price_per_million == 0.28


def test_model_configuration_status_summarizes_routed_profiles(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """models:
  default_model: primary-model
  api_key_env: PRIMARY_KEY
  routing:
    enabled: true
    default_profile: primary
    fallback_profiles: [economy]
  profiles:
    primary:
      model: primary-model
    economy:
      model: economy-model
      api_key_env: ECONOMY_KEY
""",
        encoding="utf-8",
    )

    status = inspect_model_configuration(config_path, environ={"ECONOMY_KEY": "secret"})

    assert status.configured is True
    assert status.routing_enabled is True
    assert status.configured_profiles == 1
    assert status.total_profiles == 2
    assert "secret" not in str(status.to_dict())


def test_routed_client_uses_selected_profile_model_and_credential(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """models:
  default_model: primary-model
  api_key_env: PRIMARY_KEY
  base_url: https://provider.example/v1
  routing:
    enabled: true
    phase_routes:
      inspect: economy
    fallback_profiles: [default]
  profiles:
    economy:
      model: economy-model
      api_key_env: ECONOMY_KEY
""",
        encoding="utf-8",
    )
    environ = {"PRIMARY_KEY": "primary-secret", "ECONOMY_KEY": "economy-secret"}
    routing = load_model_routing_config(config_path)
    plan = build_model_route_plan(
        run_id="run-routed-provider",
        mode="Bugfix",
        context_tokens=100,
        config=routing,
        environ=environ,
    )
    transport = RecordingTransport(
        response={
            "model": "economy-model",
            "choices": [{"message": {"content": '{"type":"finish","rationale":"done","params":{"message":"done"}}'}}],
            "usage": {"prompt_tokens": 4, "completion_tokens": 2},
        }
    )
    client = create_routed_model_client(
        config_path,
        plan,
        environ=environ,
        transport=transport,
    )
    request = ModelRequest(
        messages=[ModelMessage(role="user", content="inspect")],
        metadata={"capability_phase": "inspect"},
    )

    selection = client.route_request(request)
    response = client.complete(request)

    assert selection.profile_id == "economy"
    assert transport.calls[0]["headers"]["Authorization"] == "Bearer economy-secret"
    assert transport.calls[0]["payload"]["model"] == "economy-model"
    assert response.metadata["route_profile"] == "economy"
    assert "primary-secret" not in str(response.to_dict())
    assert "economy-secret" not in str(response.to_dict())


@pytest.mark.parametrize("value", ["invalid", -0.01, ".nan", True])
def test_model_provider_config_rejects_invalid_token_prices(tmp_path: Path, value: object) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        f"models:\n  input_price_per_million: {value}\n",
        encoding="utf-8",
    )

    with pytest.raises(ModelConfigurationError, match="input_price_per_million"):
        load_model_provider_config(config_path)


def test_provider_client_completes_agent_loop_without_secret_in_trace(tmp_path: Path) -> None:
    secret = "test-secret-must-not-leak"
    transport = RecordingTransport(
        response={
            "model": "demo-model",
            "choices": [
                {
                    "message": {
                        "content": '{"type":"finish","rationale":"done","params":{"message":"complete"}}'
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }
    )
    client = create_model_client(
        write_model_config(tmp_path / "config.yaml"),
        environ={"MINIAGENT_TEST_API_KEY": secret},
        transport=transport,
    )
    contract = AgentContract(agent_id="provider-loop-test")
    gateway = ToolGateway(workspace_root=tmp_path, contract=contract)
    tracer = TraceWriter(tmp_path / "runs")

    result = execute_agent_run(
        run_id="run-provider-loop",
        task="finish safely",
        contract=contract,
        gateway=gateway,
        model_client=client,
        tracer=tracer,
    )

    assert result.status == RunPhase.COMPLETED
    assert result.final_message == "complete"
    assert result.token_usage == {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}
    trace_text = tracer.trace_path("run-provider-loop").read_text(encoding="utf-8")
    assert secret not in trace_text
