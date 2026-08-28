from __future__ import annotations

from pathlib import Path

from app.models import (
    ExtensionCatalog,
    ExtensionSettings,
    HookEvent,
    HookFailurePolicy,
    HookManifest,
    MCPServerManifest,
)
from app.runtime.config import load_yaml
from app.runtime.skills import load_skill_cards


def load_extension_catalog(
    workspace: str | Path,
    mode: str,
    *,
    fallback_agent_dir: str | Path,
) -> tuple[ExtensionCatalog, ExtensionSettings, Path]:
    root = Path(workspace).resolve()
    local_agent = root / ".agent"
    fallback = Path(fallback_agent_dir).resolve()
    skills_registry = local_agent / "skills.yaml"
    if not skills_registry.is_file():
        skills_registry = fallback / "skills.yaml"

    diagnostics: list[str] = []
    try:
        skills = load_skill_cards(skills_registry, mode=mode)
    except (OSError, KeyError, TypeError, ValueError) as exc:
        skills = []
        diagnostics.append(f"Skills registry: {exc}")

    mcp_path = local_agent / "mcp.yaml"
    if not mcp_path.is_file():
        mcp_path = fallback / "mcp.yaml"
    hooks_path = local_agent / "hooks.yaml"
    if not hooks_path.is_file():
        hooks_path = fallback / "hooks.yaml"

    mcp_servers = _load_mcp_servers(mcp_path, diagnostics) if mcp_path.is_file() else []
    hooks = _load_hooks(hooks_path, diagnostics) if hooks_path.is_file() else []
    catalog = ExtensionCatalog(
        skills=skills,
        mcp_servers=mcp_servers,
        hooks=hooks,
        diagnostics=diagnostics,
    )
    settings = ExtensionSettings(
        active_skill_ids=[skill.id for skill in skills if skill.valid and skill.recommended],
    )
    return catalog, settings, skills_registry


def validate_extension_settings(catalog: ExtensionCatalog, settings: ExtensionSettings, mode: str) -> None:
    skills = {item.id: item for item in catalog.skills}
    servers = {item.id: item for item in catalog.mcp_servers}
    hooks = {item.id: item for item in catalog.hooks}
    _validate_unique(settings.active_skill_ids, "active skill")
    _validate_unique(settings.enabled_mcp_server_ids, "enabled MCP server")
    _validate_unique(settings.enabled_hook_ids, "enabled hook")

    for skill_id in settings.active_skill_ids:
        skill = skills.get(skill_id)
        if skill is None or not skill.valid:
            raise ValueError(f"Unknown or invalid skill: {skill_id}")
        if skill.modes and mode not in skill.modes:
            raise ValueError(f"Skill {skill_id} is not compatible with mode {mode}")
    for server_id in settings.enabled_mcp_server_ids:
        server = servers.get(server_id)
        if server is None or not server.valid:
            raise ValueError(f"Unknown or invalid MCP server: {server_id}")
    for hook_id in settings.enabled_hook_ids:
        hook = hooks.get(hook_id)
        if hook is None or not hook.valid:
            raise ValueError(f"Unknown or invalid hook: {hook_id}")


def _load_mcp_servers(path: Path, diagnostics: list[str]) -> list[MCPServerManifest]:
    try:
        data = load_yaml(path)
        entries = data.get("servers", [])
        if not isinstance(entries, list):
            raise ValueError("servers must be a list")
    except (OSError, TypeError, ValueError) as exc:
        diagnostics.append(f"MCP registry: {exc}")
        return []
    result: list[MCPServerManifest] = []
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            diagnostics.append("MCP server entry must be a mapping")
            continue
        server_id = str(entry.get("id", "")).strip()
        command = entry.get("command", [])
        errors: list[str] = []
        if not server_id:
            errors.append("MCP server id is required")
        elif server_id in seen:
            errors.append(f"Duplicate MCP server id: {server_id}")
        seen.add(server_id)
        if not isinstance(command, list) or not command or not all(isinstance(item, str) and item for item in command):
            errors.append("MCP command must be a non-empty argv list")
            command = []
        transport = str(entry.get("transport", "stdio"))
        if transport != "stdio":
            errors.append("Only stdio MCP transport is supported")
        result.append(
            MCPServerManifest(
                id=server_id,
                name=str(entry.get("name", server_id)),
                command=list(command),
                transport=transport,
                timeout_seconds=int(entry.get("timeout_seconds", 15)),
                env_allow=[str(value) for value in entry.get("env_allow", [])],
                effect=str(entry.get("effect", "mcp.call")),
                risk=str(entry.get("risk", "high")),
                valid=not errors,
                errors=errors,
            )
        )
    return result


def _load_hooks(path: Path, diagnostics: list[str]) -> list[HookManifest]:
    try:
        data = load_yaml(path)
        entries = data.get("hooks", [])
        if not isinstance(entries, list):
            raise ValueError("hooks must be a list")
    except (OSError, TypeError, ValueError) as exc:
        diagnostics.append(f"Hook registry: {exc}")
        return []
    result: list[HookManifest] = []
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            diagnostics.append("Hook entry must be a mapping")
            continue
        hook_id = str(entry.get("id", "")).strip()
        command = entry.get("command", [])
        errors: list[str] = []
        if not hook_id:
            errors.append("Hook id is required")
        elif hook_id in seen:
            errors.append(f"Duplicate hook id: {hook_id}")
        seen.add(hook_id)
        try:
            event = HookEvent(str(entry.get("event", "")))
        except ValueError:
            event = HookEvent.RUN_BEFORE
            errors.append("Hook event is unsupported")
        try:
            failure_policy = HookFailurePolicy(str(entry.get("failure_policy", "warn")))
        except ValueError:
            failure_policy = HookFailurePolicy.WARN
            errors.append("Hook failure policy is unsupported")
        if not isinstance(command, list) or not command or not all(isinstance(item, str) and item for item in command):
            errors.append("Hook command must be a non-empty argv list")
            command = []
        result.append(
            HookManifest(
                id=hook_id,
                name=str(entry.get("name", hook_id)),
                event=event,
                command=list(command),
                timeout_seconds=int(entry.get("timeout_seconds", 10)),
                failure_policy=failure_policy,
                valid=not errors,
                errors=errors,
            )
        )
    return result


def _validate_unique(values: list[str], label: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"Duplicate {label} id")
