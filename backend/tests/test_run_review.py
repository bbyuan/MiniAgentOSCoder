from __future__ import annotations

from pathlib import Path

from app.models import RunArtifacts
from app.runtime.run_artifact_writer import RunArtifactWriter
from app.runtime.run_review import read_patch_preview, record_change_review


class FakeHistory:
    def __init__(self) -> None:
        self.updates: list[tuple[str, dict[str, object]]] = []

    def update_change_review(self, run_id: str, review: dict[str, object]) -> bool:
        self.updates.append((run_id, review))
        return True


def test_read_patch_preview_redacts_and_truncates(tmp_path: Path) -> None:
    writer = RunArtifactWriter(tmp_path, "run-1")
    writer.patch_path.parent.mkdir(parents=True)
    writer.patch_path.write_text(
        "line 1\napi_key=secret-value\nline 3\n",
        encoding="utf-8",
    )

    preview = read_patch_preview(tmp_path, "run-1", max_lines=2)

    assert preview == {
        "available": True,
        "content": "line 1\n[REDACTED_SECRET]",
        "truncated": True,
    }


def test_read_patch_preview_returns_empty_shape_when_missing(tmp_path: Path) -> None:
    assert read_patch_preview(None, "run-1") == {
        "available": False,
        "content": "",
        "truncated": False,
    }
    assert read_patch_preview(tmp_path, "run-1") == {
        "available": False,
        "content": "",
        "truncated": False,
    }


def test_record_change_review_updates_artifacts_and_history() -> None:
    artifacts = RunArtifacts(run_id="run-1")
    history = FakeHistory()

    review = record_change_review(
        artifacts=artifacts,
        history=history,
        run_id="run-1",
        status="accepted",
        reason="  token=secret-value  ",
        checkpoint_id="checkpoint-1",
    )

    assert review["status"] == "accepted"
    assert review["reason"] == "[REDACTED_SECRET]"
    assert review["checkpoint_id"] == "checkpoint-1"
    assert isinstance(review["decided_at"], str)
    assert artifacts.change_review.status == "accepted"
    assert history.updates == [("run-1", review)]
