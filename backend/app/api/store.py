from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from threading import RLock
from typing import Any

from app.models import (
    AgentContract,
    ApprovalRequest,
    ContextPack,
    ExtensionCatalog,
    ExtensionSettings,
    GovernanceSettings,
    RunArtifacts,
    RunLoopResult,
    RunState,
)
from app.runtime.run_worker import RunWorker
from app.runtime.history_store import HistoryStore


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
    run_results: dict[str, RunLoopResult] = field(default_factory=dict)
    run_projects: dict[str, str] = field(default_factory=dict)
    governance: dict[str, GovernanceSettings] = field(default_factory=dict)
    extension_catalogs: dict[str, ExtensionCatalog] = field(default_factory=dict)
    extension_settings: dict[str, ExtensionSettings] = field(default_factory=dict)
    skills_registries: dict[str, Path] = field(default_factory=dict)
    context_lock: RLock = field(default_factory=RLock)
    worker: RunWorker = field(default_factory=RunWorker)
    history: HistoryStore = field(default_factory=HistoryStore)

    def configure_history(self, path: str | Path) -> None:
        self.history.close()
        self.history = HistoryStore(path)
        self.history.mark_interrupted()


store = RuntimeStore()
