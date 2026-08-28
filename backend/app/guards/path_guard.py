from __future__ import annotations

from pathlib import Path


class PathEscape(PermissionError):
    pass


def resolve_workspace_path(workspace_root: str | Path, candidate: str | Path) -> Path:
    root = Path(workspace_root).resolve()
    path = (root / candidate).resolve() if not Path(candidate).is_absolute() else Path(candidate).resolve()

    if path != root and root not in path.parents:
        raise PathEscape(f"Path escapes workspace: {candidate}")
    return path

