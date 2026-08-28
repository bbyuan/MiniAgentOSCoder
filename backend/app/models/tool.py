from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Callable

from app.models.base import Serializable


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ApprovalPolicy(StrEnum):
    AUTO = "auto"
    APPROVAL_REQUIRED = "approval_required"
    DEPENDS_ON_EFFECT = "depends_on_effect"


@dataclass(slots=True)
class ToolDescriptor(Serializable):
    name: str
    description: str
    effect: str
    risk: RiskLevel
    approval_policy: ApprovalPolicy
    input_schema: dict[str, Any]
    timeout_seconds: int = 30
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ToolResult(Serializable):
    ok: bool
    tool: str
    output: str = ""
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


ToolHandler = Callable[[dict[str, Any]], ToolResult]
