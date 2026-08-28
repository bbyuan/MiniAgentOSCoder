from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.models.base import Serializable


@dataclass(slots=True)
class TraceEvent(Serializable):
    run_id: str
    event: str
    payload: dict[str, Any]
    role: str = "runtime"
    time: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

