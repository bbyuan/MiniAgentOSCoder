from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.models import AgentContract, ApprovalRequest, ContextPack, RunArtifacts, RunState


@dataclass
class ProjectRecord:
    project_id: str
    path: Path
    profile: dict[str, Any]


@dataclass
class RuntimeStore:
    projects: dict[str, ProjectRecord] = field(default_factory=dict)
    current_project_id: str | None = None
    runs: dict[str, RunState] = field(default_factory=dict)
    contracts: dict[str, AgentContract] = field(default_factory=dict)
    contexts: dict[str, ContextPack] = field(default_factory=dict)
    approvals: dict[str, ApprovalRequest] = field(default_factory=dict)
    artifacts: dict[str, RunArtifacts] = field(default_factory=dict)


store = RuntimeStore()
