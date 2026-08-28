from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.models.base import Serializable


@dataclass(slots=True)
class ActionIR(Serializable):
    type: str
    rationale: str
    params: dict[str, Any] = field(default_factory=dict)
    role: str = "Orchestrator"
    action_id: str | None = None

