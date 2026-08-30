from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

from app.models.base import to_plain
from app.runtime.config import load_governance_settings, load_yaml
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.extensions import load_extension_catalog
from app.runtime.model_provider import inspect_model_provider, load_model_routing_config
from app.runtime.paths import default_agent_dir


def build_agent_pack_manifest(
    *,
    project_id: str,
    workspace: str | Path,
    project_profile: dict[str, Any],
    config_path: str | Path,
    mode: str = "Feature",
) -> dict[str, Any]:
    root = Path(workspace).resolve()
    config_file = Path(config_path).resolve()
    config = load_yaml(config_file)
    agent = config.get("agent", {})
    if not isinstance(agent, dict):
        agent = {}

    contract = compile_agent_contract(
        config_file,
        task_mode=mode,
        project_profile=project_profile,
    )
    governance = load_governance_settings(config_file)
    routing = load_model_routing_config(config_file)
    catalog, settings, skills_registry = load_extension_catalog(
        root,
        mode,
        fallback_agent_dir=default_agent_dir(),
    )
    profiles = []
    for profile_id, profile in routing.profiles.items():
        status = inspect_model_provider(profile)
        profiles.append({
            "profile_id": profile_id,
            "provider": status.provider,
            "model": status.model,
            "api_key_env": status.api_key_env,
            "configured": status.configured,
            "issues": status.issues,
            "context_window": profile.context_window,
            "pricing_configured": (
                profile.input_price_per_million is not None
                and profile.output_price_per_million is not None
            ),
        })

    payload = {
        "manifest_version": "agentpack.v1",
        "project_id": project_id,
        "workspace": {
            "name": root.name,
            "profile": project_profile,
        },
        "agent": {
            "id": str(agent.get("id", contract.agent_id)),
            "name": str(agent.get("name", contract.agent_id)),
            "mode": str(agent.get("mode", "orchestrator")),
            "roles": [str(role) for role in agent.get("roles", [])] if isinstance(agent.get("roles", []), list) else [],
        },
        "contract": contract.to_dict(),
        "governance": {
            "sandbox_profile": governance.sandbox_profile.value,
            "effect_policy_count": len(contract.effects.allow) + len(contract.effects.deny),
            "tool_policy_count": len(contract.policies.to_dict()),
        },
        "models": {
            "routing_enabled": routing.enabled,
            "strategy": "policy" if routing.enabled else "single",
            "default_profile_id": routing.default_profile_id,
            "phase_routes": routing.phase_routes,
            "mode_routes": routing.mode_routes,
            "fallback_profile_ids": routing.fallback_profile_ids,
            "profiles": profiles,
        },
        "extensions": {
            "skills_registry": _relative_or_name(skills_registry, root),
            "skills": {
                "available": len(catalog.skills),
                "recommended": len([skill for skill in catalog.skills if skill.recommended and skill.valid]),
                "active_by_default": settings.active_skill_ids,
            },
            "mcp_servers": {
                "available": len(catalog.mcp_servers),
                "valid": len([server for server in catalog.mcp_servers if server.valid]),
            },
            "hooks": {
                "available": len(catalog.hooks),
                "valid": len([hook for hook in catalog.hooks if hook.valid]),
            },
            "diagnostics": catalog.diagnostics,
        },
        "provenance": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "config_source": "project" if _is_relative_to(config_file, root) else "default",
            "config_path": _relative_or_name(config_file, root),
            "config_digest": _digest_file(config_file),
            "project_profile_digest": _digest_value(project_profile),
        },
    }
    payload["digest"] = _digest_value(_stable_payload(payload))
    return payload


def _stable_payload(payload: dict[str, Any]) -> dict[str, Any]:
    stable = dict(payload)
    stable.pop("digest", None)
    provenance = dict(stable.get("provenance", {}))
    provenance.pop("generated_at", None)
    stable["provenance"] = provenance
    return stable


def _digest_file(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _digest_value(value: Any) -> str:
    text = json.dumps(to_plain(value), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return sha256(text.encode("utf-8")).hexdigest()


def _relative_or_name(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return path.name


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True
