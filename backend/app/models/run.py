from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.models.base import Serializable


class RunPhase(StrEnum):
    CREATED = "created"
    SCANNING = "scanning"
    PLANNING = "planning"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    APPLYING_PATCH = "applying_patch"
    TESTING = "testing"
    REPAIRING = "repairing"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    FAILED = "failed"


@dataclass(slots=True)
class RunState(Serializable):
    run_id: str
    task: str
    status: RunPhase = RunPhase.CREATED
    mode: str = "Bugfix"
    plan: list[dict[str, Any]] = field(default_factory=list)
    current_step: int = 0
    changed_files: list[str] = field(default_factory=list)
    test_status: str | None = None
    budget: dict[str, Any] = field(default_factory=dict)
    memory_refs: list[str] = field(default_factory=list)
    last_observation: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Checkpoint(Serializable):
    checkpoint_id: str
    run_id: str
    step: int
    status: RunPhase
    run_state: dict[str, Any]
    context_summary: str
    memory_snapshot: dict[str, Any] = field(default_factory=dict)
    changed_files: list[str] = field(default_factory=list)
    trace_offset: int = 0


@dataclass(slots=True)
class ApprovalRequest(Serializable):
    approval_id: str
    run_id: str
    action_id: str
    risk: str
    effect: str
    reason: str
    target: dict[str, Any]
    options: list[str] = field(default_factory=lambda: ["approve_once", "approve_pattern", "deny", "edit"])


@dataclass(slots=True)
class RunStatus(Serializable):
    run_id: str
    status: RunPhase
    phase: str
    current_action: str | None = None
    waiting_on: str | None = None
    can_resume: bool = False
    can_replay: bool = False
    last_checkpoint_id: str | None = None

