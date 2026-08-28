from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.models import TraceEvent


class TraceWriter:
    def __init__(self, runs_dir: str | Path) -> None:
        self.runs_dir = Path(runs_dir)

    def append(self, event: TraceEvent) -> Path:
        trace_path = self.trace_path(event.run_id)
        trace_path.parent.mkdir(parents=True, exist_ok=True)
        with trace_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event.to_dict(), ensure_ascii=False) + "\n")
        return trace_path

    def event(self, run_id: str, event: str, payload: dict[str, Any], role: str = "runtime") -> TraceEvent:
        trace_event = TraceEvent(run_id=run_id, event=event, payload=payload, role=role)
        self.append(trace_event)
        return trace_event

    def read_events(self, run_id: str) -> list[dict[str, Any]]:
        trace_path = self.trace_path(run_id)
        if not trace_path.exists():
            return []
        text = trace_path.read_text(encoding="utf-8")
        lines = text.splitlines()
        events: list[dict[str, Any]] = []
        for index, line in enumerate(lines):
            if not line.strip():
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                if index == len(lines) - 1 and not text.endswith("\n"):
                    break
                raise
        return events

    def trace_path(self, run_id: str) -> Path:
        return self.runs_dir / run_id / "trace.jsonl"
