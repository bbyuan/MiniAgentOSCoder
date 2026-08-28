from __future__ import annotations

import json
from pathlib import Path

from app.models import RecoveryPoint
from app.runtime.checkpoint import CheckpointStore
from app.tools import PatchPipeline, PatchPipelineError, RestoreSummary


class RecoveryError(ValueError):
    pass


class RunRecovery:
    def __init__(self, workspace: str | Path, run_id: str) -> None:
        self.workspace = Path(workspace).resolve()
        self.run_id = run_id
        self.runs_dir = self.workspace / "runs"
        self.checkpoints = CheckpointStore(self.runs_dir)

    def list_points(self, *, run_active: bool = False) -> list[RecoveryPoint]:
        points: list[RecoveryPoint] = []
        for checkpoint in self.checkpoints.list(self.run_id):
            files = self._manifest_files(self.snapshot_dir(checkpoint.checkpoint_id))
            snapshot_available = files is not None
            points.append(
                RecoveryPoint(
                    checkpoint_id=checkpoint.checkpoint_id,
                    run_id=checkpoint.run_id,
                    step=checkpoint.step,
                    status=checkpoint.status,
                    trace_offset=checkpoint.trace_offset,
                    files=files or checkpoint.changed_files,
                    snapshot_available=snapshot_available,
                    can_rollback=snapshot_available and not run_active,
                )
            )
        return points

    def restore(self, checkpoint_id: str) -> RestoreSummary:
        checkpoint = self.checkpoints.load(self.run_id, checkpoint_id)
        if checkpoint is None:
            raise RecoveryError("Checkpoint not found")
        snapshot_dir = self.snapshot_dir(checkpoint_id)
        if self._manifest_files(snapshot_dir) is None:
            raise RecoveryError("Checkpoint does not have a restorable snapshot")
        try:
            return PatchPipeline(self.workspace).restore(snapshot_dir)
        except PatchPipelineError as exc:
            raise RecoveryError(str(exc)) from exc

    def snapshot_dir(self, checkpoint_id: str) -> Path:
        if Path(checkpoint_id).name != checkpoint_id:
            raise RecoveryError("Checkpoint id is invalid")
        return self.runs_dir / self.run_id / "snapshots" / checkpoint_id

    @staticmethod
    def _manifest_files(snapshot_dir: Path) -> list[str] | None:
        manifest_path = snapshot_dir / "manifest.json"
        if not manifest_path.is_file():
            return None
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(manifest, dict) or not manifest or not all(
            isinstance(path, str) and isinstance(existed, bool)
            for path, existed in manifest.items()
        ):
            return None
        return sorted(manifest)
