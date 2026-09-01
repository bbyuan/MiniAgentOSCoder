from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from app.guards import redact_secrets
from app.models import RunArtifacts
from app.runtime.run_artifact_writer import RunArtifactWriter


class ChangeReviewHistory(Protocol):
    def update_change_review(self, run_id: str, review: dict[str, object]) -> bool:
        ...


def read_patch_preview(project_path: Path | None, run_id: str, max_lines: int = 180) -> dict[str, object]:
    if project_path is None:
        return _empty_preview()
    writer = RunArtifactWriter(project_path, run_id)
    if not writer.patch_path.is_file():
        return _empty_preview()
    content = redact_secrets(writer.patch_path.read_text(encoding="utf-8", errors="replace"))
    lines = content.splitlines()
    truncated = len(lines) > max_lines
    return {
        "available": True,
        "content": "\n".join(lines[:max_lines]),
        "truncated": truncated,
    }


def record_change_review(
    *,
    artifacts: RunArtifacts,
    history: ChangeReviewHistory,
    run_id: str,
    status: str,
    reason: str = "",
    checkpoint_id: str | None = None,
) -> dict[str, object]:
    artifacts.change_review.status = status
    artifacts.change_review.decided_at = datetime.now(timezone.utc).isoformat()
    artifacts.change_review.checkpoint_id = checkpoint_id
    artifacts.change_review.reason = redact_secrets(reason.strip())[:1000]
    review = artifacts.change_review.to_dict()
    history.update_change_review(run_id, review)
    return review


def _empty_preview() -> dict[str, object]:
    return {"available": False, "content": "", "truncated": False}
