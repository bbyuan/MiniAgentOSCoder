from __future__ import annotations

from pathlib import Path
from typing import Any


def discover_project_protocols(workspace: str | Path) -> dict[str, Any]:
    root = Path(workspace).resolve()
    items: list[dict[str, Any]] = []

    for path in _existing_files(root, ["AGENTS.md", ".agent/AGENTS.md"]):
        items.append(_item("agent_doc", path, root, "active", "Agent operating instructions"))

    for path in _skill_files(root):
        items.append(_item("skill", path, root, "active", "Reusable agent skill instructions"))

    specs_dir = root / "openspec" / "specs"
    if specs_dir.is_dir():
        for path in sorted(specs_dir.glob("*/spec.md")):
            items.append(_item("openspec_spec", path, root, "active", "Accepted capability specification"))

    changes_dir = root / "openspec" / "changes"
    if changes_dir.is_dir():
        for change_dir in sorted(path for path in changes_dir.iterdir() if path.is_dir()):
            status = "active" if (change_dir / "tasks.md").exists() else "draft"
            path = change_dir / "proposal.md" if (change_dir / "proposal.md").exists() else change_dir
            items.append(_item("openspec_change", path, root, status, "OpenSpec change proposal"))

    counts = {
        "agent_docs": len([item for item in items if item["type"] == "agent_doc"]),
        "skills": len([item for item in items if item["type"] == "skill"]),
        "openspec_specs": len([item for item in items if item["type"] == "openspec_spec"]),
        "openspec_changes": len([item for item in items if item["type"] == "openspec_change"]),
    }
    total = len(items)
    recommendations: list[str] = []
    if counts["agent_docs"] == 0:
        recommendations.append("add_agent_doc")
    if counts["openspec_specs"] == 0 and counts["openspec_changes"] == 0:
        recommendations.append("add_openspec")
    if counts["skills"] == 0:
        recommendations.append("add_skill")

    return {
        "workspace": root.name,
        "summary": {
            "total": total,
            "active": len([item for item in items if item["status"] == "active"]),
            "draft": len([item for item in items if item["status"] == "draft"]),
            **counts,
        },
        "items": items,
        "recommendations": recommendations,
    }


def _existing_files(root: Path, candidates: list[str]) -> list[Path]:
    return [root / candidate for candidate in candidates if (root / candidate).is_file()]


def _skill_files(root: Path) -> list[Path]:
    paths: list[Path] = []
    candidates = [root / "SKILL.md", root / ".agent" / "SKILL.md"]
    paths.extend(path for path in candidates if path.is_file())
    skills_dir = root / ".agent" / "skills"
    if skills_dir.is_dir():
        paths.extend(sorted(skills_dir.glob("*/SKILL.md")))
    return paths


def _item(kind: str, path: Path, root: Path, status: str, summary: str) -> dict[str, Any]:
    return {
        "id": f"{kind}:{_relative(path, root)}",
        "type": kind,
        "title": _title(path, root),
        "path": _relative(path, root),
        "status": status,
        "summary": summary,
    }


def _title(path: Path, root: Path) -> str:
    relative = Path(_relative(path, root))
    if relative.name == "proposal.md" and len(relative.parts) >= 3:
        return relative.parts[-2]
    if relative.name == "spec.md" and len(relative.parts) >= 3:
        return relative.parts[-2]
    if relative.name == "SKILL.md" and len(relative.parts) >= 2:
        return relative.parts[-2]
    return relative.name


def _relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return path.name
