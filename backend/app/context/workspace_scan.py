from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from app.models.base import Serializable


IGNORED_DIRS = {".git", ".venv", "node_modules", "dist", "__pycache__", ".pytest_cache"}

LANGUAGE_BY_SUFFIX = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".css": "css",
    ".html": "html",
}


@dataclass(slots=True)
class ProjectProfile(Serializable):
    path: str
    languages: list[str] = field(default_factory=list)
    package_managers: list[str] = field(default_factory=list)
    test_commands: list[str] = field(default_factory=list)
    lint_commands: list[str] = field(default_factory=list)
    entrypoints: list[str] = field(default_factory=list)
    ignore: list[str] = field(default_factory=lambda: sorted(IGNORED_DIRS))
    sensitive_patterns: list[str] = field(default_factory=lambda: [".env", "id_rsa", "*.pem", "*.key"])


def scan_workspace(workspace_root: str | Path) -> ProjectProfile:
    root = Path(workspace_root).resolve()
    files = [path for path in _iter_files(root)]
    languages = sorted({LANGUAGE_BY_SUFFIX[path.suffix] for path in files if path.suffix in LANGUAGE_BY_SUFFIX})

    package_managers: list[str] = []
    test_commands: list[str] = []
    lint_commands: list[str] = []
    entrypoints: list[str] = []

    if (root / "pyproject.toml").exists():
        package_managers.append("pip")
        test_commands.append("pytest")
    if (root / "package.json").exists():
        package_managers.append("npm")
        test_commands.append("npm test")
        lint_commands.append("npm run lint")
    if (root / "backend" / "app" / "main.py").exists():
        entrypoints.append("backend/app/main.py")
    if (root / "frontend" / "src" / "main.tsx").exists():
        entrypoints.append("frontend/src/main.tsx")

    return ProjectProfile(
        path=str(root),
        languages=languages,
        package_managers=package_managers,
        test_commands=test_commands,
        lint_commands=lint_commands,
        entrypoints=entrypoints,
    )


def write_project_profile(profile: ProjectProfile, workspace_root: str | Path) -> Path:
    target = Path(workspace_root) / ".agent" / "project-profile.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(profile.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def _iter_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if path.is_file():
            files.append(path)
    return files

