from __future__ import annotations

import os
from pathlib import Path
import sys


def default_agent_dir() -> Path:
    configured = os.environ.get("MINIAGENTOS_DEFAULT_AGENT_DIR")
    if configured:
        return Path(configured).expanduser().resolve()

    bundle_root = getattr(sys, "_MEIPASS", None)
    if getattr(sys, "frozen", False) and bundle_root:
        return (Path(bundle_root) / ".agent").resolve()

    return Path(__file__).resolve().parents[3] / ".agent"
