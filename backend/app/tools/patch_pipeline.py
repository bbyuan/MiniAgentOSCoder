from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
import shutil
import subprocess

from app.guards import resolve_workspace_path


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
        old_path: str | None = None
        for line in unified_diff.splitlines():
            if line.startswith("--- "):
                old_path = self._normalize_diff_path(line.removeprefix("--- "))
            elif line.startswith("+++ "):
                new_path = self._normalize_diff_path(line.removeprefix("+++ "))
                target = new_path or old_path
                if target is not None and target not in summary.files:
                    self._validate_target(target)
                    summary.files.append(target)
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
            ["git", "apply", "--check", "--no-index", "--unsafe-paths", "-"],
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
            ["git", "apply", "--no-index", "--unsafe-paths", "-"],
            cwd=self.workspace_root,
            input=unified_diff,
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            raise PatchPipelineError(completed.stderr.strip() or "Patch apply failed")
        return summary

    def snapshot(self, summary: PatchSummary, destination: str | Path) -> Path:
        snapshot_root = Path(destination)
        snapshot_root.mkdir(parents=True, exist_ok=True)
        manifest: dict[str, bool] = {}
        for relative in summary.files:
            source = self._validate_target(relative)
            manifest[relative] = source.exists()
            if source.exists():
                target = snapshot_root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
        manifest_path = snapshot_root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
        return manifest_path

    def _validate_target(self, relative: str) -> Path:
        path = Path(relative)
        if path.is_absolute() or not path.parts:
            raise PatchPipelineError(f"Patch target must be workspace-relative: {relative}")
        if path.parts[0] in {".agent", ".git", "runs"} or path.name.startswith(".env"):
            raise PatchPipelineError(f"Patch target is protected: {relative}")
        try:
            return resolve_workspace_path(self.workspace_root, path)
        except PermissionError as exc:
            raise PatchPipelineError(str(exc)) from exc

    @staticmethod
    def _normalize_diff_path(value: str) -> str | None:
        path = value.split("\t", 1)[0].strip()
        if path == "/dev/null":
            return None
        if path.startswith(("a/", "b/")):
            path = path[2:]
        return path
