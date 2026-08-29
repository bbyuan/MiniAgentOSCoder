from __future__ import annotations

from dataclasses import dataclass, field

from app.models.base import Serializable


@dataclass(slots=True)
class ModelRouteProfile(Serializable):
    profile_id: str
    provider: str
    model: str
    configured: bool
    context_window: int | None = None
    issues: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ModelRouteSelection(Serializable):
    phase: str
    preferred_profile_id: str
    profile_id: str
    provider: str
    model: str
    reason: str
    fallback: bool
    configured: bool
    context_window: int | None = None
    issues: list[str] = field(default_factory=list)
    cache_namespace: str = ""


@dataclass(slots=True)
class ModelRoutePlan(Serializable):
    run_id: str
    enabled: bool
    strategy: str
    decision: str
    can_start: bool
    mode: str
    context_tokens: int
    default_profile_id: str
    routes: dict[str, ModelRouteSelection] = field(default_factory=dict)
    profiles: list[ModelRouteProfile] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
