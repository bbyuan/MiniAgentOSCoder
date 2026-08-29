from __future__ import annotations

import os
import math
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from app.models.base import Serializable
from app.runtime.config import load_yaml
from app.runtime.model_client import ModelClient
from app.runtime.openai_compatible import JsonTransport, OpenAICompatibleModelClient


SUPPORTED_PROVIDERS = {"openai", "openai-compatible"}
SUPPORTED_TOKEN_FIELDS = {"max_tokens", "max_completion_tokens"}


class ModelConfigurationError(ValueError):
    pass


@dataclass(slots=True)
class ModelProviderConfig(Serializable):
    provider: str = "openai-compatible"
    default_model: str = "unset"
    api_key_env: str = "OPENAI_API_KEY"
    base_url: str = "https://api.openai.com/v1"
    base_url_env: str | None = "OPENAI_BASE_URL"
    timeout_seconds: int = 60
    json_mode: bool = True
    max_tokens_field: str = "max_tokens"
    input_price_per_million: float | None = None
    output_price_per_million: float | None = None
    context_window: int | None = None


@dataclass(slots=True)
class ModelProviderStatus(Serializable):
    provider: str
    model: str
    api_key_env: str
    base_url: str
    configured: bool
    issues: list[str] = field(default_factory=list)
    routing_enabled: bool = False
    configured_profiles: int = 0
    total_profiles: int = 1


def load_model_provider_config(path: str | Path) -> ModelProviderConfig:
    config = load_yaml(path)
    models = config.get("models", {})
    if not isinstance(models, dict):
        raise ModelConfigurationError("models must be a mapping")
    return _provider_config_from_mapping(models, "models")


def load_model_routing_config(path: str | Path):
    from app.runtime.model_routing import ModelRoutingConfig, ModelRoutingError, ROUTE_PHASES, validate_profile_id

    config = load_yaml(path)
    models = config.get("models", {})
    if not isinstance(models, dict):
        raise ModelConfigurationError("models must be a mapping")
    root = _provider_config_from_mapping(models, "models")
    profiles: dict[str, ModelProviderConfig] = {"default": root}
    profile_payload = models.get("profiles", {})
    if not isinstance(profile_payload, dict):
        raise ModelRoutingError("models.profiles must be a mapping")
    for raw_profile_id, payload in profile_payload.items():
        profile_id = validate_profile_id(raw_profile_id, "models.profiles id")
        if profile_id == "default":
            raise ModelRoutingError("models.profiles.default is reserved for the legacy root model")
        if not isinstance(payload, dict):
            raise ModelRoutingError(f"models.profiles.{profile_id} must be a mapping")
        profiles[profile_id] = _provider_config_from_mapping(
            payload,
            f"models.profiles.{profile_id}",
            base=root,
        )

    routing_payload = models.get("routing", {})
    if not isinstance(routing_payload, dict):
        raise ModelRoutingError("models.routing must be a mapping")
    enabled = routing_payload.get("enabled", False)
    if not isinstance(enabled, bool):
        raise ModelRoutingError("models.routing.enabled must be a boolean")
    default_profile_id = validate_profile_id(
        routing_payload.get("default_profile", "default"),
        "models.routing.default_profile",
    )
    phase_routes = _route_mapping(
        routing_payload.get("phase_routes", {}),
        "models.routing.phase_routes",
        allowed_keys=set(ROUTE_PHASES),
    )
    mode_routes = _route_mapping(
        routing_payload.get("mode_routes", {}),
        "models.routing.mode_routes",
        allowed_keys={"bugfix", "feature", "review", "spec", "chat"},
        normalize_keys=True,
    )
    fallback_payload = routing_payload.get("fallback_profiles", [])
    if not isinstance(fallback_payload, list):
        raise ModelRoutingError("models.routing.fallback_profiles must be a list")
    fallback_profile_ids = [
        validate_profile_id(value, f"models.routing.fallback_profiles[{index}]")
        for index, value in enumerate(fallback_payload)
    ]
    referenced = {
        default_profile_id,
        *phase_routes.values(),
        *mode_routes.values(),
        *fallback_profile_ids,
    }
    unknown = sorted(referenced - set(profiles))
    if unknown:
        raise ModelRoutingError(f"Model routing references unknown Profiles: {', '.join(unknown)}")
    return ModelRoutingConfig(
        enabled=enabled,
        default_profile_id=default_profile_id,
        phase_routes=phase_routes,
        mode_routes=mode_routes,
        fallback_profile_ids=list(dict.fromkeys(fallback_profile_ids)),
        profiles=profiles,
    )


def _provider_config_from_mapping(
    models: dict[str, object],
    prefix: str,
    *,
    base: ModelProviderConfig | None = None,
) -> ModelProviderConfig:
    defaults = base or ModelProviderConfig()

    json_mode = models.get("json_mode", defaults.json_mode)
    if not isinstance(json_mode, bool):
        raise ModelConfigurationError(f"{prefix}.json_mode must be a boolean")

    timeout_seconds = _positive_int(models.get("timeout_seconds", defaults.timeout_seconds), f"{prefix}.timeout_seconds")
    max_tokens_field = str(models.get("max_tokens_field", defaults.max_tokens_field))
    if max_tokens_field not in SUPPORTED_TOKEN_FIELDS:
        raise ModelConfigurationError(
            f"{prefix}.max_tokens_field must be max_tokens or max_completion_tokens"
        )

    base_url_env = models.get("base_url_env", defaults.base_url_env)
    if base_url_env is not None and not isinstance(base_url_env, str):
        raise ModelConfigurationError(f"{prefix}.base_url_env must be a string or null")

    context_window_value = models.get("context_window", defaults.context_window)
    context_window = None if context_window_value is None else _positive_int(
        context_window_value,
        f"{prefix}.context_window",
    )
    default_model = models.get("model", models.get("default_model", defaults.default_model))

    return ModelProviderConfig(
        provider=str(models.get("provider", defaults.provider)).strip().lower(),
        default_model=str(default_model).strip(),
        api_key_env=str(models.get("api_key_env", defaults.api_key_env)).strip(),
        base_url=str(models.get("base_url", defaults.base_url)).strip(),
        base_url_env=base_url_env.strip() if isinstance(base_url_env, str) and base_url_env.strip() else None,
        timeout_seconds=timeout_seconds,
        json_mode=json_mode,
        max_tokens_field=max_tokens_field,
        input_price_per_million=_optional_nonnegative_float(
            models.get("input_price_per_million", defaults.input_price_per_million),
            f"{prefix}.input_price_per_million",
        ),
        output_price_per_million=_optional_nonnegative_float(
            models.get("output_price_per_million", defaults.output_price_per_million),
            f"{prefix}.output_price_per_million",
        ),
        context_window=context_window,
    )


def inspect_model_provider(
    config: ModelProviderConfig,
    environ: Mapping[str, str] | None = None,
) -> ModelProviderStatus:
    values = os.environ if environ is None else environ
    issues: list[str] = []
    if config.provider not in SUPPORTED_PROVIDERS:
        issues.append("unsupported_provider")
    if not config.default_model or config.default_model == "unset":
        issues.append("model_not_configured")
    if not config.api_key_env:
        issues.append("api_key_env_not_configured")
    elif not values.get(config.api_key_env):
        issues.append(f"missing_environment_variable:{config.api_key_env}")

    base_url = _resolve_base_url(config, values)
    try:
        _validate_base_url(base_url)
    except ModelConfigurationError:
        issues.append("invalid_base_url")

    return ModelProviderStatus(
        provider=config.provider,
        model=config.default_model,
        api_key_env=config.api_key_env,
        base_url=_safe_base_url(base_url),
        configured=not issues,
        issues=issues,
    )


def inspect_model_configuration(
    path: str | Path,
    environ: Mapping[str, str] | None = None,
) -> ModelProviderStatus:
    routing = load_model_routing_config(path)
    default_config = routing.profiles[routing.default_profile_id]
    if not routing.enabled:
        return inspect_model_provider(default_config, environ)

    active_profile_ids = {
        routing.default_profile_id,
        *routing.phase_routes.values(),
        *routing.mode_routes.values(),
        *routing.fallback_profile_ids,
    }
    statuses = {
        profile_id: inspect_model_provider(profile, environ)
        for profile_id, profile in routing.profiles.items()
        if profile_id in active_profile_ids
    }
    configured_profiles = sum(status.configured for status in statuses.values())
    default_status = statuses[routing.default_profile_id]
    issues = [] if configured_profiles else sorted({
        issue
        for status in statuses.values()
        for issue in status.issues
    })
    return ModelProviderStatus(
        provider=default_status.provider,
        model=default_status.model,
        api_key_env=default_status.api_key_env,
        base_url=default_status.base_url,
        configured=configured_profiles > 0,
        issues=issues,
        routing_enabled=True,
        configured_profiles=configured_profiles,
        total_profiles=len(statuses),
    )


def create_model_client(
    config_path: str | Path,
    *,
    environ: Mapping[str, str] | None = None,
    transport: JsonTransport | None = None,
) -> ModelClient:
    config = load_model_provider_config(config_path)
    return _create_model_client_from_config(config, environ=environ, transport=transport)


def create_routed_model_client(
    config_path: str | Path,
    route_plan,
    *,
    environ: Mapping[str, str] | None = None,
    transport: JsonTransport | None = None,
) -> ModelClient:
    from app.runtime.model_routing import RoutedModelClient

    routing = load_model_routing_config(config_path)
    profile_ids = {route.profile_id for route in route_plan.routes.values() if route.configured}
    clients = {
        profile_id: _create_model_client_from_config(
            routing.profiles[profile_id],
            environ=environ,
            transport=transport,
        )
        for profile_id in profile_ids
    }
    return RoutedModelClient(clients=clients, plan=route_plan)


def _create_model_client_from_config(
    config: ModelProviderConfig,
    *,
    environ: Mapping[str, str] | None = None,
    transport: JsonTransport | None = None,
) -> ModelClient:
    values = os.environ if environ is None else environ
    status = inspect_model_provider(config, values)
    if not status.configured:
        raise ModelConfigurationError(f"Model provider is not configured: {', '.join(status.issues)}")

    api_key = values[config.api_key_env]
    base_url = _resolve_base_url(config, values)
    _validate_base_url(base_url)
    client_options = {
        "api_key": api_key,
        "base_url": base_url.rstrip("/"),
        "default_model": config.default_model,
        "timeout_seconds": config.timeout_seconds,
        "json_mode": config.json_mode,
        "max_tokens_field": config.max_tokens_field,
    }
    if transport is not None:
        client_options["transport"] = transport
    return OpenAICompatibleModelClient(**client_options)


def _route_mapping(
    value: object,
    field_name: str,
    *,
    allowed_keys: set[str],
    normalize_keys: bool = False,
) -> dict[str, str]:
    from app.runtime.model_routing import ModelRoutingError, validate_profile_id

    if not isinstance(value, dict):
        raise ModelRoutingError(f"{field_name} must be a mapping")
    parsed: dict[str, str] = {}
    for raw_key, raw_profile in value.items():
        key = str(raw_key).strip().lower() if normalize_keys else str(raw_key).strip()
        if key not in allowed_keys:
            raise ModelRoutingError(f"{field_name} contains unsupported key: {raw_key}")
        parsed[key] = validate_profile_id(raw_profile, f"{field_name}.{raw_key}")
    return parsed


def _resolve_base_url(config: ModelProviderConfig, environ: Mapping[str, str]) -> str:
    if config.base_url_env and environ.get(config.base_url_env):
        return environ[config.base_url_env].strip()
    return config.base_url.strip()


def _validate_base_url(value: str) -> None:
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        parsed.port
    except ValueError as exc:
        raise ModelConfigurationError("Model provider base URL is invalid") from exc
    if parsed.scheme not in {"http", "https"} or not hostname:
        raise ModelConfigurationError("Model provider base URL must use http or https")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ModelConfigurationError(
            "Model provider base URL must not contain credentials, query, or fragment"
        )


def _safe_base_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        return "invalid"
    if parsed.scheme not in {"http", "https"} or not hostname:
        return "invalid"
    host = hostname
    if port is not None:
        host = f"{host}:{port}"
    return urlunsplit((parsed.scheme, host, parsed.path.rstrip("/"), "", ""))


def _positive_int(value: object, field_name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ModelConfigurationError(f"{field_name} must be a positive integer") from exc
    if parsed <= 0:
        raise ModelConfigurationError(f"{field_name} must be a positive integer")
    return parsed


def _optional_nonnegative_float(value: object, field_name: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ModelConfigurationError(f"{field_name} must be a non-negative number")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ModelConfigurationError(f"{field_name} must be a non-negative number") from exc
    if not math.isfinite(parsed) or parsed < 0:
        raise ModelConfigurationError(f"{field_name} must be a non-negative number")
    return parsed
