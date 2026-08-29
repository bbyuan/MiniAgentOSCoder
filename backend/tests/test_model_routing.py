import json
from pathlib import Path

import pytest

from app.models import AgentContract
from app.runtime.model_client import QueuedStaticModelClient
from app.runtime.model_provider import (
    ModelProviderConfig,
    load_model_routing_config,
)
from app.runtime.model_routing import (
    ModelRoutingConfig,
    ModelRoutingError,
    RoutedModelClient,
    build_model_route_plan,
)
from app.runtime.planner import plan_next_action
from app.runtime.prompt_cache import PromptCache
from app.runtime.tracer import TraceWriter


def _write_routing_config(path: Path) -> Path:
    path.write_text(
        """models:
  provider: openai-compatible
  default_model: primary-model
  api_key_env: PRIMARY_KEY
  base_url: https://primary.example/v1
  timeout_seconds: 45
  routing:
    enabled: true
    default_profile: primary
    phase_routes:
      inspect: economy
      repair: primary
    mode_routes:
      Review: economy
    fallback_profiles: [primary]
  profiles:
    primary:
      model: primary-model
      context_window: 128000
    economy:
      model: economy-model
      api_key_env: ECONOMY_KEY
      context_window: 64000
""",
        encoding="utf-8",
    )
    return path


def test_legacy_model_configuration_synthesizes_default_profile(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        "models:\n  default_model: legacy-model\n  api_key_env: LEGACY_KEY\n",
        encoding="utf-8",
    )

    routing = load_model_routing_config(path)
    plan = build_model_route_plan(
        run_id="run-legacy",
        mode="Bugfix",
        context_tokens=5000,
        config=routing,
        environ={},
    )

    assert routing.enabled is False
    assert list(routing.profiles) == ["default"]
    assert plan.strategy == "single"
    assert plan.can_start is True
    assert {route.profile_id for route in plan.routes.values()} == {"default"}
    assert {route.model for route in plan.routes.values()} == {"legacy-model"}


def test_profile_configuration_inherits_root_provider_options(tmp_path: Path) -> None:
    routing = load_model_routing_config(_write_routing_config(tmp_path / "config.yaml"))

    economy = routing.profiles["economy"]
    assert routing.enabled is True
    assert routing.default_profile_id == "primary"
    assert routing.mode_routes == {"review": "economy"}
    assert economy.provider == "openai-compatible"
    assert economy.base_url == "https://primary.example/v1"
    assert economy.timeout_seconds == 45
    assert economy.api_key_env == "ECONOMY_KEY"
    assert economy.context_window == 64000


def test_routing_rejects_unknown_profile_reference(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        "models:\n  routing:\n    enabled: true\n    phase_routes:\n      inspect: missing\n",
        encoding="utf-8",
    )

    with pytest.raises(ModelRoutingError, match="unknown Profiles: missing"):
        load_model_routing_config(path)


def test_route_plan_uses_explicit_fallback_when_context_does_not_fit(tmp_path: Path) -> None:
    routing = load_model_routing_config(_write_routing_config(tmp_path / "config.yaml"))

    plan = build_model_route_plan(
        run_id="run-fallback",
        mode="Bugfix",
        context_tokens=70000,
        config=routing,
        environ={"PRIMARY_KEY": "secret", "ECONOMY_KEY": "secret"},
    )

    assert plan.can_start is True
    assert plan.decision == "fallback"
    assert plan.routes["inspect"].profile_id == "primary"
    assert plan.routes["inspect"].fallback is True
    assert plan.routes["inspect"].reason == "fallback_context_window"
    assert plan.routes["repair"].profile_id == "primary"


def test_route_plan_blocks_without_a_feasible_declared_fallback() -> None:
    config = ModelRoutingConfig(
        enabled=True,
        profiles={
            "default": ModelProviderConfig(
                default_model="small-model",
                api_key_env="MODEL_KEY",
                context_window=100,
            ),
        },
    )

    plan = build_model_route_plan(
        run_id="run-blocked",
        mode="Feature",
        context_tokens=101,
        config=config,
        environ={"MODEL_KEY": "secret"},
    )

    assert plan.can_start is False
    assert plan.decision == "blocked"
    assert all("context_window_exceeded" in route.issues[0] for route in plan.routes.values())


def test_routed_planner_requests_use_distinct_cache_namespaces(tmp_path: Path) -> None:
    config = ModelRoutingConfig(
        enabled=True,
        default_profile_id="primary",
        phase_routes={"inspect": "economy", "work": "primary"},
        profiles={
            "default": ModelProviderConfig(default_model="unused", api_key_env="UNUSED"),
            "economy": ModelProviderConfig(default_model="economy-model", api_key_env="ECONOMY_KEY"),
            "primary": ModelProviderConfig(default_model="primary-model", api_key_env="PRIMARY_KEY"),
        },
    )
    plan = build_model_route_plan(
        run_id="run-cache-route",
        mode="Bugfix",
        context_tokens=10,
        config=config,
        environ={"ECONOMY_KEY": "secret", "PRIMARY_KEY": "secret"},
    )
    economy = QueuedStaticModelClient([
        json.dumps({"type": "read_file", "rationale": "inspect", "params": {"path": "app.py"}})
    ], model="economy-model")
    primary = QueuedStaticModelClient([
        json.dumps({"type": "read_file", "rationale": "inspect", "params": {"path": "app.py"}})
    ], model="primary-model")
    client = RoutedModelClient(
        clients={"economy": economy, "primary": primary},
        plan=plan,
    )
    tracer = TraceWriter(tmp_path / "runs")
    cache = PromptCache()

    inspect = plan_next_action(
        run_id="run-cache-route",
        task="inspect app",
        contract=AgentContract(agent_id="router"),
        tools=[],
        model_client=client,
        tracer=tracer,
        prompt_cache=cache,
        capability_phase="inspect",
    )
    work = plan_next_action(
        run_id="run-cache-route",
        task="inspect app",
        contract=AgentContract(agent_id="router"),
        tools=[],
        model_client=client,
        tracer=tracer,
        prompt_cache=cache,
        capability_phase="work",
    )

    assert inspect.cache_hit is False
    assert work.cache_hit is False
    assert economy.requests[0].model == "economy-model"
    assert primary.requests[0].model == "primary-model"
    assert economy.requests[0].metadata["model_cache_namespace"] != primary.requests[0].metadata["model_cache_namespace"]
    route_events = [
        event for event in tracer.read_events("run-cache-route")
        if event["event"] == "model.route.selected"
    ]
    assert [event["payload"]["profile_id"] for event in route_events] == ["economy", "primary"]


def test_route_cache_namespace_uses_effective_endpoint() -> None:
    config = ModelRoutingConfig(
        enabled=True,
        profiles={
            "default": ModelProviderConfig(
                default_model="same-model",
                api_key_env="MODEL_KEY",
                base_url_env="ROUTE_URL",
            ),
        },
    )

    first = build_model_route_plan(
        run_id="run-first-endpoint",
        mode="Chat",
        context_tokens=10,
        config=config,
        environ={"MODEL_KEY": "secret", "ROUTE_URL": "https://first.example/v1"},
    )
    second = build_model_route_plan(
        run_id="run-second-endpoint",
        mode="Chat",
        context_tokens=10,
        config=config,
        environ={"MODEL_KEY": "secret", "ROUTE_URL": "https://second.example/v1"},
    )

    assert first.routes["inspect"].cache_namespace != second.routes["inspect"].cache_namespace
