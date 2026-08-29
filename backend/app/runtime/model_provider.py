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


@dataclass(slots=True)
class ModelProviderStatus(Serializable):
    provider: str
    model: str
    api_key_env: str
    base_url: str
    configured: bool
    issues: list[str] = field(default_factory=list)


def load_model_provider_config(path: str | Path) -> ModelProviderConfig:
    config = load_yaml(path)
    models = config.get("models", {})
    if not isinstance(models, dict):
        raise ModelConfigurationError("models must be a mapping")

    json_mode = models.get("json_mode", True)
    if not isinstance(json_mode, bool):
        raise ModelConfigurationError("models.json_mode must be a boolean")

    timeout_seconds = _positive_int(models.get("timeout_seconds", 60), "models.timeout_seconds")
    max_tokens_field = str(models.get("max_tokens_field", "max_tokens"))
    if max_tokens_field not in SUPPORTED_TOKEN_FIELDS:
        raise ModelConfigurationError(
            "models.max_tokens_field must be max_tokens or max_completion_tokens"
        )

    base_url_env = models.get("base_url_env", "OPENAI_BASE_URL")
    if base_url_env is not None and not isinstance(base_url_env, str):
        raise ModelConfigurationError("models.base_url_env must be a string or null")

    return ModelProviderConfig(
        provider=str(models.get("provider", "openai-compatible")).strip().lower(),
        default_model=str(models.get("default_model", "unset")).strip(),
        api_key_env=str(models.get("api_key_env", "OPENAI_API_KEY")).strip(),
        base_url=str(models.get("base_url", "https://api.openai.com/v1")).strip(),
        base_url_env=base_url_env.strip() if isinstance(base_url_env, str) and base_url_env.strip() else None,
        timeout_seconds=timeout_seconds,
        json_mode=json_mode,
        max_tokens_field=max_tokens_field,
        input_price_per_million=_optional_nonnegative_float(
            models.get("input_price_per_million"),
            "models.input_price_per_million",
        ),
        output_price_per_million=_optional_nonnegative_float(
            models.get("output_price_per_million"),
            "models.output_price_per_million",
        ),
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


def create_model_client(
    config_path: str | Path,
    *,
    environ: Mapping[str, str] | None = None,
    transport: JsonTransport | None = None,
) -> ModelClient:
    config = load_model_provider_config(config_path)
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
