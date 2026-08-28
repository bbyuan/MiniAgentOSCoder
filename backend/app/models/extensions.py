from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from app.models.base import Serializable


class HookEvent(StrEnum):
    RUN_BEFORE = "run.before"
    RUN_AFTER = "run.after"
    TOOL_BEFORE = "tool.before"
    TOOL_AFTER = "tool.after"


class HookFailurePolicy(StrEnum):
    WARN = "warn"
    BLOCK = "block"


@dataclass(slots=True)
class SkillManifest(Serializable):
    id: str
    name: str
    description: str
    path: str
    modes: list[str] = field(default_factory=list)
    default_tools: list[str] = field(default_factory=list)
    risk: str = "medium"
    recommended: bool = False
    valid: bool = True
    errors: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ActiveSkill(Serializable):
    id: str
    name: str
    description: str
    path: str
    content: str
    digest: str


@dataclass(slots=True)
class MCPServerManifest(Serializable):
    id: str
    name: str
    command: list[str]
    transport: str = "stdio"
    timeout_seconds: int = 15
    env_allow: list[str] = field(default_factory=list)
    effect: str = "mcp.call"
    risk: str = "high"
    valid: bool = True
    errors: list[str] = field(default_factory=list)


@dataclass(slots=True)
class HookManifest(Serializable):
    id: str
    name: str
    event: HookEvent
    command: list[str]
    timeout_seconds: int = 10
    failure_policy: HookFailurePolicy = HookFailurePolicy.WARN
    valid: bool = True
    errors: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ExtensionCatalog(Serializable):
    skills: list[SkillManifest] = field(default_factory=list)
    mcp_servers: list[MCPServerManifest] = field(default_factory=list)
    hooks: list[HookManifest] = field(default_factory=list)
    diagnostics: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ExtensionSettings(Serializable):
    active_skill_ids: list[str] = field(default_factory=list)
    enabled_mcp_server_ids: list[str] = field(default_factory=list)
    enabled_hook_ids: list[str] = field(default_factory=list)
