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


def save_agent_pack_version(manifest: dict[str, Any], workspace: str | Path) -> dict[str, Any]:
    root = Path(workspace).resolve()
    versions_dir = root / ".agent" / "agentpacks" / "versions"
    versions_dir.mkdir(parents=True, exist_ok=True)
    digest = str(manifest.get("digest", ""))
    generated_at = str(manifest.get("provenance", {}).get("generated_at", datetime.now(timezone.utc).isoformat()))
    version_id = _version_id(generated_at, digest)
    payload = dict(manifest)
    payload["version_id"] = version_id
    target = versions_dir / f"{version_id}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return _version_summary(payload, target, root)


def list_agent_pack_versions(workspace: str | Path) -> list[dict[str, Any]]:
    root = Path(workspace).resolve()
    versions_dir = root / ".agent" / "agentpacks" / "versions"
    if not versions_dir.is_dir():
        return []
    versions: list[dict[str, Any]] = []
    for path in sorted(versions_dir.glob("*.json"), reverse=True):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict):
            versions.append(_version_summary(payload, path, root))
    return sorted(versions, key=lambda item: str(item.get("generated_at", "")), reverse=True)


def _stable_payload(payload: dict[str, Any]) -> dict[str, Any]:
    stable = dict(payload)
    stable.pop("digest", None)
    provenance = dict(stable.get("provenance", {}))
    provenance.pop("generated_at", None)
    stable["provenance"] = provenance
    return stable


def _version_summary(payload: dict[str, Any], path: Path, root: Path) -> dict[str, Any]:
    contract = payload.get("contract", {}) if isinstance(payload.get("contract"), dict) else {}
    cost = contract.get("cost_envelope", {}) if isinstance(contract.get("cost_envelope"), dict) else {}
    models = payload.get("models", {}) if isinstance(payload.get("models"), dict) else {}
    extensions = payload.get("extensions", {}) if isinstance(payload.get("extensions"), dict) else {}
    skills = extensions.get("skills", {}) if isinstance(extensions.get("skills"), dict) else {}
    return {
        "version_id": str(payload.get("version_id", path.stem)),
        "manifest_version": str(payload.get("manifest_version", "agentpack.v1")),
        "digest": str(payload.get("digest", "")),
        "generated_at": str(payload.get("provenance", {}).get("generated_at", "")) if isinstance(payload.get("provenance"), dict) else "",
        "agent_id": str(payload.get("agent", {}).get("id", "")) if isinstance(payload.get("agent"), dict) else "",
        "agent_name": str(payload.get("agent", {}).get("name", "")) if isinstance(payload.get("agent"), dict) else "",
        "mode": str(contract.get("program", {}).get("mode", "")) if isinstance(contract.get("program"), dict) else "",
        "max_steps": int(cost.get("max_steps", 0) or 0),
        "model_strategy": str(models.get("strategy", "single")),
        "model_profiles": len(models.get("profiles", [])) if isinstance(models.get("profiles", []), list) else 0,
        "active_skills": len(skills.get("active_by_default", [])) if isinstance(skills.get("active_by_default", []), list) else 0,
        "path": _relative_or_name(path, root),
    }


def _version_id(generated_at: str, digest: str) -> str:
    safe_time = "".join(character for character in generated_at[:19] if character.isdigit() or character == "T")
    return f"{safe_time or 'agentpack'}-{digest[:12] or 'snapshot'}"


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
