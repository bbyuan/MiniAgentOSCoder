from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import subprocess


class PatchPipelineError(ValueError):
    pass


@dataclass(slots=True)
class PatchSummary:
    files: list[str] = field(default_factory=list)
    additions: int = 0
    deletions: int = 0


class PatchPipeline:
    def __init__(self, workspace_root: str | Path) -> None:
        self.workspace_root = Path(workspace_root).resolve()

    def summarize(self, unified_diff: str) -> PatchSummary:
        if not unified_diff.strip():
            raise PatchPipelineError("Patch must not be empty")

        summary = PatchSummary()
        for line in unified_diff.splitlines():
            if line.startswith("+++ b/"):
                summary.files.append(line.removeprefix("+++ b/"))
            elif line.startswith("+") and not line.startswith("+++"):
                summary.additions += 1
            elif line.startswith("-") and not line.startswith("---"):
                summary.deletions += 1

        if not summary.files:
            raise PatchPipelineError("Patch does not include target files")
        return summary

    def dry_run(self, unified_diff: str) -> PatchSummary:
        return self.summarize(unified_diff)

    def check_apply(self, unified_diff: str) -> PatchSummary:
        summary = self.summarize(unified_diff)
        completed = subprocess.run(
            ["git", "apply", "--check", "-"],
            cwd=self.workspace_root,
            input=unified_diff,
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            raise PatchPipelineError(completed.stderr.strip() or "Patch dry-run failed")
        return summary

    def apply(self, unified_diff: str) -> PatchSummary:
        summary = self.check_apply(unified_diff)
        completed = subprocess.run(
            ["git", "apply", "-"],
            cwd=self.workspace_root,
            input=unified_diff,
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            raise PatchPipelineError(completed.stderr.strip() or "Patch apply failed")
        return summary
