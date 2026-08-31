from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.store import store
from app.models import ExtensionSettings, HookEvent, HookFailurePolicy, RunPhase
from app.runtime.config import load_yaml, yaml
from app.runtime.extensions import load_extension_catalog, validate_extension_settings
from app.runtime.paths import default_agent_dir
from app.runtime.tracer import TraceWriter


router = APIRouter(prefix="/runs", tags=["extensions"])


class UpdateExtensionsRequest(BaseModel):
    active_skill_ids: list[str] = Field(default_factory=list)
    enabled_mcp_server_ids: list[str] = Field(default_factory=list)
    enabled_hook_ids: list[str] = Field(default_factory=list)


class CreateSkillRequest(BaseModel):
    id: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=240)
    content: str = Field(min_length=10, max_length=12000)
    modes: list[str] = Field(default_factory=list)
    default_tools: list[str] = Field(default_factory=lambda: ["read_file", "search_code"])
    risk: str = Field(default="medium")


class CreateMCPServerRequest(BaseModel):
    id: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    command: list[str] = Field(min_length=1, max_length=24)
    env_allow: list[str] = Field(default_factory=list)
    timeout_seconds: int = Field(default=15, ge=1, le=120)
    risk: str = Field(default="high")


class CreateHookRequest(BaseModel):
    id: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    event: HookEvent = HookEvent.RUN_AFTER
    command: list[str] = Field(min_length=1, max_length=24)
    timeout_seconds: int = Field(default=30, ge=1, le=120)
    failure_policy: HookFailurePolicy = HookFailurePolicy.WARN


@router.get("/{run_id}/extensions")
def get_extensions(run_id: str) -> dict[str, object]:
    run = store.runs.get(run_id)
    catalog = store.extension_catalogs.get(run_id)
    settings = store.extension_settings.get(run_id)
    project = _project_for_run(run_id)
    if run is None or catalog is None or settings is None or project is None:
        raise HTTPException(status_code=404, detail="Run extensions not found")
    events = TraceWriter(project.path / "runs").read_events(run_id)
    evidence = [
        event
        for event in events
        if str(event.get("event", "")).startswith(("skill.", "mcp.", "hook."))
    ]
    discovered_tools = [
        {
            "server_id": event.get("payload", {}).get("server_id"),
            "tools": event.get("payload", {}).get("tools", []),
            "tool_count": event.get("payload", {}).get("tool_count", 0),
        }
        for event in evidence
        if event.get("event") == "mcp.tools.discovered" and isinstance(event.get("payload"), dict)
    ]
    extension_events = [str(event.get("event", "")) for event in evidence]
    return {
        "run_id": run_id,
        "editable": run.status == RunPhase.PLANNING and not store.worker.is_active(run_id),
        "catalog": _public_catalog(catalog),
        "settings": settings.to_dict(),
        "summary": {
            "enabled_total": len(settings.active_skill_ids)
            + len(settings.enabled_mcp_server_ids)
            + len(settings.enabled_hook_ids),
            "available_total": len(catalog.skills) + len(catalog.mcp_servers) + len(catalog.hooks),
            "diagnostic_count": len(catalog.diagnostics),
            "skills_active": len(settings.active_skill_ids),
            "skills_available": len(catalog.skills),
            "mcp_enabled": len(settings.enabled_mcp_server_ids),
            "mcp_available": len(catalog.mcp_servers),
            "mcp_tools_discovered": sum(
                int(item.get("tool_count", 0))
                for item in discovered_tools
                if isinstance(item.get("tool_count", 0), int)
            ),
            "hooks_enabled": len(settings.enabled_hook_ids),
            "hooks_available": len(catalog.hooks),
            "runtime_events": len(evidence),
            "runtime_failures": sum(
                1
                for event in evidence
                if isinstance(event.get("payload"), dict) and event["payload"].get("ok") is False
            ),
            "has_runtime_activation": any(
                event_name
                in {"skill.activated", "mcp.tools.discovered", "mcp.tool.called", "hook.finished"}
                for event_name in extension_events
            ),
        },
        "discovered_tools": discovered_tools,
        "evidence": evidence,
    }


@router.put("/{run_id}/extensions")
def update_extensions(run_id: str, request: UpdateExtensionsRequest) -> dict[str, object]:
    run = store.runs.get(run_id)
    catalog = store.extension_catalogs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or catalog is None or project is None:
        raise HTTPException(status_code=404, detail="Run extensions not found")
    if run.status != RunPhase.PLANNING or store.worker.is_active(run_id):
        raise HTTPException(status_code=409, detail="Extensions can only change before a run starts")
    settings = ExtensionSettings(
        active_skill_ids=request.active_skill_ids,
        enabled_mcp_server_ids=request.enabled_mcp_server_ids,
        enabled_hook_ids=request.enabled_hook_ids,
    )
    try:
        validate_extension_settings(catalog, settings, run.mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    store.extension_settings[run_id] = settings
    TraceWriter(project.path / "runs").event(
        run_id,
        "extension.updated",
        settings.to_dict(),
    )
    return get_extensions(run_id)


@router.post("/{run_id}/extensions/skills")
def create_skill(run_id: str, request: CreateSkillRequest) -> dict[str, object]:
    run, project = _editable_run(run_id)
    skill_id = _safe_id(request.id, "Skill")
    catalog = store.extension_catalogs.get(run_id)
    if catalog is not None and any(skill.id == skill_id for skill in catalog.skills):
        raise HTTPException(status_code=409, detail="Skill id already exists")

    agent_dir = project.path / ".agent"
    skill_file = agent_dir / "skills" / skill_id / "SKILL.md"
    if skill_file.exists():
        raise HTTPException(status_code=409, detail="Skill file already exists")
    skill_file.parent.mkdir(parents=True, exist_ok=True)
    skill_file.write_text(request.content.strip() + "\n", encoding="utf-8")

    registry_path = agent_dir / "skills.yaml"
    registry = _load_registry(registry_path, "skills")
    entries = registry["skills"]
    entries.append({
        "id": skill_id,
        "name": request.name.strip(),
        "description": request.description.strip(),
        "path": f".agent/skills/{skill_id}/SKILL.md",
        "modes": request.modes or [run.mode],
        "default_tools": request.default_tools,
        "risk": request.risk,
    })
    _write_registry(registry_path, registry)

    refreshed = _refresh_run_extensions(run_id, run.mode)
    if skill_id not in refreshed.active_skill_ids:
        refreshed.active_skill_ids.append(skill_id)
    validate_extension_settings(store.extension_catalogs[run_id], refreshed, run.mode)
    store.extension_settings[run_id] = refreshed
    TraceWriter(project.path / "runs").event(run_id, "extension.skill.created", {"skill_id": skill_id})
    return get_extensions(run_id)


@router.post("/{run_id}/extensions/mcp-servers")
def create_mcp_server(run_id: str, request: CreateMCPServerRequest) -> dict[str, object]:
    run, project = _editable_run(run_id)
    server_id = _safe_id(request.id, "MCP server")
    catalog = store.extension_catalogs.get(run_id)
    if catalog is not None and any(server.id == server_id for server in catalog.mcp_servers):
        raise HTTPException(status_code=409, detail="MCP server id already exists")
    command = [part.strip() for part in request.command if part.strip()]
    if not command:
        raise HTTPException(status_code=422, detail="MCP command must not be empty")

    registry_path = project.path / ".agent" / "mcp.yaml"
    registry = _load_registry(registry_path, "servers")
    entries = registry["servers"]
    entries.append({
        "id": server_id,
        "name": request.name.strip(),
        "transport": "stdio",
        "command": command,
        "timeout_seconds": request.timeout_seconds,
        "env_allow": [value.strip() for value in request.env_allow if value.strip()],
        "effect": "mcp.call",
        "risk": request.risk,
    })
    _write_registry(registry_path, registry)

    refreshed = _refresh_run_extensions(run_id, run.mode)
    if server_id not in refreshed.enabled_mcp_server_ids:
        refreshed.enabled_mcp_server_ids.append(server_id)
    validate_extension_settings(store.extension_catalogs[run_id], refreshed, run.mode)
    store.extension_settings[run_id] = refreshed
    TraceWriter(project.path / "runs").event(run_id, "extension.mcp.created", {"server_id": server_id})
    return get_extensions(run_id)


@router.post("/{run_id}/extensions/hooks")
def create_hook(run_id: str, request: CreateHookRequest) -> dict[str, object]:
    run, project = _editable_run(run_id)
    hook_id = _safe_id(request.id, "Hook")
    catalog = store.extension_catalogs.get(run_id)
    if catalog is not None and any(hook.id == hook_id for hook in catalog.hooks):
        raise HTTPException(status_code=409, detail="Hook id already exists")
    command = [part.strip() for part in request.command if part.strip()]
    if not command:
        raise HTTPException(status_code=422, detail="Hook command must not be empty")

    registry_path = project.path / ".agent" / "hooks.yaml"
    registry = _load_registry(registry_path, "hooks")
    entries = registry["hooks"]
    entries.append({
        "id": hook_id,
        "name": request.name.strip(),
        "event": request.event.value,
        "command": command,
        "timeout_seconds": request.timeout_seconds,
        "failure_policy": request.failure_policy.value,
    })
    _write_registry(registry_path, registry)

    refreshed = _refresh_run_extensions(run_id, run.mode)
    if hook_id not in refreshed.enabled_hook_ids:
        refreshed.enabled_hook_ids.append(hook_id)
    validate_extension_settings(store.extension_catalogs[run_id], refreshed, run.mode)
    store.extension_settings[run_id] = refreshed
    TraceWriter(project.path / "runs").event(run_id, "extension.hook.created", {"hook_id": hook_id})
    return get_extensions(run_id)


def _project_for_run(run_id: str):
    project_id = store.run_projects.get(run_id)
    return store.projects.get(project_id) if project_id is not None else None


def _public_catalog(catalog) -> dict[str, object]:
    payload = catalog.to_dict()
    skills = payload.get("skills", [])
    if isinstance(skills, list):
        for entry in skills:
            if isinstance(entry, dict):
                entry.pop("root", None)
    for section in ("mcp_servers", "hooks"):
        entries = payload.get(section, [])
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            command = entry.pop("command", [])
            if isinstance(command, list) and command:
                entry["executable"] = Path(str(command[0])).name
                entry["argument_count"] = max(0, len(command) - 1)
            else:
                entry["executable"] = ""
                entry["argument_count"] = 0
    return payload


def _editable_run(run_id: str):
    run = store.runs.get(run_id)
    project = _project_for_run(run_id)
    if run is None or project is None:
        raise HTTPException(status_code=404, detail="Run extensions not found")
    if run.status != RunPhase.PLANNING or store.worker.is_active(run_id):
        raise HTTPException(status_code=409, detail="Extensions can only change before a run starts")
    return run, project


def _safe_id(value: str, label: str) -> str:
    normalized = value.strip()
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{1,63}", normalized):
        raise HTTPException(status_code=422, detail=f"{label} id must start with a letter and use letters, numbers, dashes, or underscores")
    return normalized


def _refresh_run_extensions(run_id: str, mode: str) -> ExtensionSettings:
    project = _project_for_run(run_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Run project not found")
    catalog, default_settings, skills_registry = load_extension_catalog(
        project.path,
        mode,
        fallback_agent_dir=default_agent_dir(),
    )
    current = store.extension_settings.get(run_id, default_settings)
    valid_skills = {item.id for item in catalog.skills if item.valid}
    valid_servers = {item.id for item in catalog.mcp_servers if item.valid}
    valid_hooks = {item.id for item in catalog.hooks if item.valid}
    refreshed = ExtensionSettings(
        active_skill_ids=[item for item in current.active_skill_ids if item in valid_skills],
        enabled_mcp_server_ids=[item for item in current.enabled_mcp_server_ids if item in valid_servers],
        enabled_hook_ids=[item for item in current.enabled_hook_ids if item in valid_hooks],
    )
    store.extension_catalogs[run_id] = catalog
    store.skills_registries[run_id] = skills_registry
    return refreshed


def _load_registry(path: Path, root_key: str) -> dict[str, list[Any]]:
    if path.is_file():
        data = load_yaml(path)
    else:
        data = {}
    entries = data.get(root_key, [])
    if not isinstance(entries, list):
        raise HTTPException(status_code=422, detail=f"{path.name} must contain a list field: {root_key}")
    return {root_key: entries}


def _write_registry(path: Path, payload: dict[str, list[Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if yaml is not None:
        text = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)
    else:
        text = _dump_simple_yaml(payload)
    path.write_text(text, encoding="utf-8")


def _dump_simple_yaml(payload: dict[str, list[Any]]) -> str:
    lines: list[str] = []
    for key, entries in payload.items():
        lines.append(f"{key}:")
        for entry in entries:
            lines.append(f"  - id: {entry.get('id', '')}")
            for field, value in entry.items():
                if field == "id":
                    continue
                if isinstance(value, list):
                    lines.append(f"    {field}:")
                    for item in value:
                        lines.append(f"      - {item}")
                else:
                    lines.append(f"    {field}: {value}")
    return "\n".join(lines) + "\n"
