from __future__ import annotations

import json
from pathlib import Path

from app.models import Checkpoint, RunPhase


class CheckpointStore:
    def __init__(self, runs_dir: str | Path) -> None:
        self.runs_dir = Path(runs_dir)

    def save(self, checkpoint: Checkpoint) -> Path:
        path = self.path_for(checkpoint.run_id, checkpoint.checkpoint_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(checkpoint.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def load(self, run_id: str, checkpoint_id: str) -> Checkpoint | None:
        path = self.path_for(run_id, checkpoint_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return Checkpoint(
            checkpoint_id=data["checkpoint_id"],
            run_id=data["run_id"],
            step=data["step"],
            status=RunPhase(data["status"]),
            run_state=data["run_state"],
            context_summary=data["context_summary"],
            memory_snapshot=data.get("memory_snapshot", {}),
            changed_files=data.get("changed_files", []),
            trace_offset=data.get("trace_offset", 0),
        )

    def list(self, run_id: str) -> list[Checkpoint]:
        checkpoints_dir = self.runs_dir / run_id / "checkpoints"
        if not checkpoints_dir.exists():
            return []
        checkpoints = [
            checkpoint
            for path in checkpoints_dir.glob("*.json")
            if (checkpoint := self.load(run_id, path.stem)) is not None
        ]
        return sorted(checkpoints, key=lambda item: (item.trace_offset, item.checkpoint_id))

    def path_for(self, run_id: str, checkpoint_id: str) -> Path:
        return self.runs_dir / run_id / "checkpoints" / f"{checkpoint_id}.json"
