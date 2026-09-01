from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.models.base import Serializable


class DecisionStatus(StrEnum):
    ALLOW = "allow"
    DENY = "deny"
    SKIPPED = "skipped"


class SandboxProfile(StrEnum):
    STANDARD = "standard"
    STRICT = "strict"


@dataclass(slots=True)
class GuardDecision(Serializable):
    guard: str
    status: DecisionStatus
    reason: str
    rule: str
    duration_ms: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PolicyEvaluation(Serializable):
    evaluation_id: str
    run_id: str
    action_id: str
    tool: str
    effect: str
    risk: str
    sandbox_profile: SandboxProfile
    outcome: str = "pending"
    effective_policy: str = "inherit"
    decisions: list[GuardDecision] = field(default_factory=list)


@dataclass(slots=True)
class GovernanceSettings(Serializable):
    sandbox_profile: SandboxProfile = SandboxProfile.STANDARD
    tool_overrides: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class SandboxCapabilities(Serializable):
    backend: str
    guarantees: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    hard_limits: list[str] = field(default_factory=list)
    not_claimed: list[str] = field(default_factory=list)
    profiles: list[str] = field(default_factory=lambda: [profile.value for profile in SandboxProfile])


@dataclass(slots=True)
class SandboxExecution(Serializable):
    sandbox_id: str
    run_id: str
    profile: SandboxProfile
    backend: str
    executable: str
    timeout_seconds: int
    returncode: int | None = None
    duration_ms: float = 0.0
    timed_out: bool = False
    output_truncated: bool = False
    termination_reason: str = "completed"
