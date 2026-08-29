from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from hashlib import sha256
import os
import re

from app.models import ModelRoutePlan, ModelRouteProfile, ModelRouteSelection
from app.runtime.model_client import ModelClient, ModelRequest, ModelResponse
from app.runtime.model_provider import ModelProviderConfig, inspect_model_provider


ROUTE_PHASES = ("inspect", "work", "verify", "repair")
_PROFILE_ID = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")


@dataclass(slots=True)
class ModelRoutingConfig:
    enabled: bool = False
    default_profile_id: str = "default"
    phase_routes: dict[str, str] = field(default_factory=dict)
    mode_routes: dict[str, str] = field(default_factory=dict)
    fallback_profile_ids: list[str] = field(default_factory=list)
    profiles: dict[str, ModelProviderConfig] = field(default_factory=dict)


class ModelRoutingError(ValueError):
    pass


def validate_profile_id(value: object, field_name: str) -> str:
    profile_id = str(value).strip()
    if not _PROFILE_ID.fullmatch(profile_id):
        raise ModelRoutingError(
            f"{field_name} must start with a lowercase letter and contain only lowercase letters, digits, _ or -"
        )
    return profile_id


def build_model_route_plan(
    *,
    run_id: str,
    mode: str,
    context_tokens: int,
    config: ModelRoutingConfig,
    environ: Mapping[str, str] | None = None,
) -> ModelRoutePlan:
    profiles = {
        profile_id: _public_profile(profile_id, profile, environ)
        for profile_id, profile in config.profiles.items()
    }
    mode_profile = config.mode_routes.get(mode.lower()) if config.enabled else None
    routes: dict[str, ModelRouteSelection] = {}
    issues: list[str] = []
    for phase in ROUTE_PHASES:
        preferred = mode_profile or (
            config.phase_routes.get(phase) if config.enabled else None
        ) or config.default_profile_id
        reason = "mode_policy" if mode_profile else (
            "phase_policy" if config.enabled and phase in config.phase_routes else "default_policy"
        )
        selection = _select_route(
            phase=phase,
            preferred_profile_id=preferred,
            preferred_reason=reason,
            context_tokens=context_tokens,
            config=config,
            profiles=profiles,
            enforce_readiness=config.enabled,
            environ=environ,
        )
        routes[phase] = selection
        if not selection.configured:
            issues.append(f"{phase}:{','.join(selection.issues) or 'no_feasible_profile'}")

    can_start = all(route.configured for route in routes.values())
    fallback = any(route.fallback for route in routes.values())
    active_profile_ids = {
        config.default_profile_id,
        *config.phase_routes.values(),
        *config.mode_routes.values(),
        *config.fallback_profile_ids,
    } if config.enabled else {config.default_profile_id}
    return ModelRoutePlan(
        run_id=run_id,
        enabled=config.enabled,
        strategy="policy" if config.enabled else "single",
        decision="blocked" if not can_start else "fallback" if fallback else "ready",
        can_start=can_start,
        mode=mode,
        context_tokens=max(0, context_tokens),
        default_profile_id=config.default_profile_id,
        routes=routes,
        profiles=[profile for profile_id, profile in profiles.items() if profile_id in active_profile_ids],
        issues=issues,
    )


def blocked_model_route_plan(run_id: str, mode: str, context_tokens: int, error: str) -> ModelRoutePlan:
    return ModelRoutePlan(
        run_id=run_id,
        enabled=True,
        strategy="policy",
        decision="blocked",
        can_start=False,
        mode=mode,
        context_tokens=max(0, context_tokens),
        default_profile_id="default",
        issues=[error],
    )


@dataclass(slots=True)
class RoutedModelClient:
    clients: dict[str, ModelClient]
    plan: ModelRoutePlan
    default_model: str = "routed"

    def route_request(self, request: ModelRequest) -> ModelRouteSelection:
        phase = str(request.metadata.get("capability_phase", "inspect"))
        selection = self.plan.routes.get(phase) or self.plan.routes.get("work")
        if selection is None or not selection.configured or selection.profile_id not in self.clients:
            raise ModelRoutingError(f"No configured model route is available for phase: {phase}")
        request.model = selection.model
        request.metadata["model_profile"] = selection.profile_id
        request.metadata["model_route_reason"] = selection.reason
        request.metadata["model_route_fallback"] = selection.fallback
        return selection

    def cache_namespace_for(self, request: ModelRequest) -> str:
        profile_id = str(request.metadata.get("model_profile", ""))
        selection = next(
            (route for route in self.plan.routes.values() if route.profile_id == profile_id),
            None,
        )
        return selection.cache_namespace if selection is not None else ""

    def complete(self, request: ModelRequest) -> ModelResponse:
        profile_id = str(request.metadata.get("model_profile", ""))
        client = self.clients.get(profile_id)
        if client is None:
            raise ModelRoutingError(f"Model route Profile is unavailable: {profile_id}")
        response = client.complete(request)
        response.metadata["route_profile"] = profile_id
        response.metadata["route_phase"] = request.metadata.get("capability_phase", "inspect")
        response.metadata["route_reason"] = request.metadata.get("model_route_reason", "")
        response.metadata["route_fallback"] = bool(request.metadata.get("model_route_fallback", False))
        return response


def _select_route(
    *,
    phase: str,
    preferred_profile_id: str,
    preferred_reason: str,
    context_tokens: int,
    config: ModelRoutingConfig,
    profiles: dict[str, ModelRouteProfile],
    enforce_readiness: bool,
    environ: Mapping[str, str] | None,
) -> ModelRouteSelection:
    candidates = _unique([preferred_profile_id, *config.fallback_profile_ids])
    failed: list[str] = []
    for candidate_id in candidates:
        profile = profiles.get(candidate_id)
        if profile is None:
            failed.append(f"unknown_profile:{candidate_id}")
            continue
        candidate_issues = list(profile.issues) if enforce_readiness else []
        if enforce_readiness and profile.context_window is not None and context_tokens > profile.context_window:
            candidate_issues.append("context_window_exceeded")
        if candidate_issues:
            failed.extend(f"{candidate_id}:{issue}" for issue in candidate_issues)
            continue
        fallback = candidate_id != preferred_profile_id
        config_profile = config.profiles[candidate_id]
        return ModelRouteSelection(
            phase=phase,
            preferred_profile_id=preferred_profile_id,
            profile_id=candidate_id,
            provider=profile.provider,
            model=profile.model,
            reason=_fallback_reason(failed) if fallback else preferred_reason,
            fallback=fallback,
            configured=True,
            context_window=profile.context_window,
            cache_namespace=_cache_namespace(candidate_id, config_profile, environ),
        )

    preferred = profiles.get(preferred_profile_id)
    return ModelRouteSelection(
        phase=phase,
        preferred_profile_id=preferred_profile_id,
        profile_id=preferred_profile_id,
        provider=preferred.provider if preferred else "",
        model=preferred.model if preferred else "",
        reason="no_feasible_profile",
        fallback=False,
        configured=False,
        context_window=preferred.context_window if preferred else None,
        issues=failed or ["no_feasible_profile"],
    )


def _public_profile(
    profile_id: str,
    config: ModelProviderConfig,
    environ: Mapping[str, str] | None,
) -> ModelRouteProfile:
    status = inspect_model_provider(config, environ)
    return ModelRouteProfile(
        profile_id=profile_id,
        provider=status.provider,
        model=status.model,
        configured=status.configured,
        context_window=config.context_window,
        issues=status.issues,
    )


def _cache_namespace(
    profile_id: str,
    config: ModelProviderConfig,
    environ: Mapping[str, str] | None,
) -> str:
    values = os.environ if environ is None else environ
    base_url = (
        values.get(config.base_url_env, "").strip()
        if config.base_url_env
        else ""
    ) or config.base_url.strip()
    safe_identity = "\n".join(
        (profile_id, config.provider, config.default_model, base_url.rstrip("/"))
    )
    return sha256(safe_identity.encode("utf-8")).hexdigest()


def _fallback_reason(failed: list[str]) -> str:
    return "fallback_context_window" if any("context_window_exceeded" in issue for issue in failed) else "fallback_unavailable"


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))
