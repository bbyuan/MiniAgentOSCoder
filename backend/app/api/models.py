from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api.store import store
from app.runtime.model_provider import (
    ModelConfigurationError,
    inspect_model_provider,
    inspect_model_configuration,
    load_model_routing_config,
)
from app.runtime.paths import default_agent_dir
from app.runtime.model_routing import ModelRoutingError

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/status")
def get_model_status(project_id: str | None = None) -> dict[str, object]:
    selected_project_id = project_id or store.current_project_id
    if selected_project_id is None:
        raise HTTPException(status_code=404, detail="No project is open")
    project = store.projects.get(selected_project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config_path = _find_config_path(project.path)
    try:
        status = inspect_model_configuration(config_path)
    except (ModelConfigurationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return status.to_dict()


@router.get("/config")
def get_model_config(project_id: str | None = None) -> dict[str, object]:
    selected_project_id = project_id or store.current_project_id
    if selected_project_id is None:
        raise HTTPException(status_code=404, detail="No project is open")
    project = store.projects.get(selected_project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config_path = _find_config_path(project.path)
    try:
        routing = load_model_routing_config(config_path)
    except (ModelConfigurationError, ModelRoutingError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    profiles = []
    for profile_id, profile in routing.profiles.items():
        status = inspect_model_provider(profile)
        profiles.append({
            "profile_id": profile_id,
            "provider": status.provider,
            "model": status.model,
            "api_key_env": status.api_key_env,
            "base_url": status.base_url,
            "configured": status.configured,
            "issues": status.issues,
            "context_window": profile.context_window,
            "pricing_configured": (
                profile.input_price_per_million is not None
                and profile.output_price_per_million is not None
            ),
        })

    return {
        "project_id": project.project_id,
        "config_path": str(config_path),
        "source": "project" if config_path.is_relative_to(project.path) else "default",
        "routing": {
            "enabled": routing.enabled,
            "strategy": "policy" if routing.enabled else "single",
            "default_profile_id": routing.default_profile_id,
            "phase_routes": routing.phase_routes,
            "mode_routes": routing.mode_routes,
            "fallback_profile_ids": routing.fallback_profile_ids,
        },
        "profiles": profiles,
    }


def _find_config_path(project_path: Path) -> Path:
    local = project_path / ".agent" / "config.yaml"
    if local.exists():
        return local
    return default_agent_dir() / "config.yaml"
