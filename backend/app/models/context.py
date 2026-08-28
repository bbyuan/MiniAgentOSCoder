from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.models.base import Serializable


@dataclass(slots=True)
class ContextItem(Serializable):
    id: str
    type: str
    source: str
    reason: str
    tokens: int
    priority: float
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ContextPackBudget(Serializable):
    max_tokens: int
    used_tokens: int
    remaining_tokens: int


@dataclass(slots=True)
class ContextPack(Serializable):
    run_id: str
    items: list[ContextItem] = field(default_factory=list)
    required_items: list[str] = field(default_factory=list)
    selected_items: list[str] = field(default_factory=list)
    compressed_items: list[str] = field(default_factory=list)
    omitted_items: list[str] = field(default_factory=list)
    budget_report: ContextPackBudget | None = None
    composition: dict[str, int] = field(default_factory=dict)
    threshold_state: str = "normal"
    compaction_count: int = 0

