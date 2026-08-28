from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum

from app.models.base import Serializable


class MemoryScope(StrEnum):
    SHORT_TERM = "short_term"
    PROJECT = "project"
    LONG_TERM = "long_term"


@dataclass(slots=True)
class MemoryEntry(Serializable):
    memory_id: str
    scope: MemoryScope
    kind: str
    content: str
    source: str
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    run_id: str | None = None
    tags: list[str] = field(default_factory=list)

