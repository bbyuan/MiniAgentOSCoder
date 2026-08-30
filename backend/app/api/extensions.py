from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.store import store
from app.models import ExtensionSettings, RunPhase
from app.runtime.extensions import validate_extension_settings
from app.runtime.tracer import TraceWriter


router = APIRouter(prefix="/runs", tags=["extensions"])


class UpdateExtensionsRequest(BaseModel):
    active_skill_ids: list[str] = Field(default_factory=list)
    enabled_mcp_server_ids: list[str] = Field(default_factory=list)
    enabled_hook_ids: list[str] = Field(default_factory=list)


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


def _project_for_run(run_id: str):
    project_id = store.run_projects.get(run_id)
    return store.projects.get(project_id) if project_id is not None else None


def _public_catalog(catalog) -> dict[str, object]:
    payload = catalog.to_dict()
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
