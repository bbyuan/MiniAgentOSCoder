from __future__ import annotations

from pathlib import Path
from typing import Any

from app.models import AgentContract, CostEnvelope, EffectSet, PolicySet, ProgramSpec
from app.runtime.config import load_yaml


def compile_agent_contract(
    config_path: str | Path,
    *,
    task_mode: str | None = None,
    project_profile: dict[str, Any] | None = None,
) -> AgentContract:
    config = load_yaml(config_path)
    agent = config.get("agent", {})
    runtime = config.get("runtime", {})
    effects = config.get("effects", {})
    policies = config.get("policies", {})

    mode = task_mode or agent.get("mode", "orchestrator")
    roles = agent.get("roles", [])
    if not isinstance(roles, list):
        raise ValueError("agent.roles must be a list")

    max_steps = int(runtime.get("max_steps", 20))
    profile_limits = (project_profile or {}).get("runtime_limits", {})

    return AgentContract(
        agent_id=str(agent.get("id", "miniagent-coder")),
        config_version=str(config.get("config_version", "v1")),
        program=ProgramSpec(
            mode=mode,
            roles=[str(role) for role in roles],
            max_steps=max_steps,
        ),
        effects=EffectSet(
            allow=[str(effect) for effect in effects.get("allow", [])],
            deny=[str(effect) for effect in effects.get("deny", [])],
        ),
        cost_envelope=CostEnvelope(
            max_steps=max_steps,
            max_model_calls=int(runtime.get("max_model_calls", 20)),
            max_tool_calls=int(runtime.get("max_tool_calls", 60)),
            max_input_tokens=int(profile_limits.get("max_input_tokens", 120000)),
            max_output_tokens=int(profile_limits.get("max_output_tokens", 20000)),
            max_wall_time_seconds=int(runtime.get("max_wall_time_seconds", 600)),
        ),
        policies=PolicySet(
            read_file=str(policies.get("read_file", "auto")),
            search_code=str(policies.get("search_code", "auto")),
            list_files=str(policies.get("list_files", "auto")),
            write_patch=str(policies.get("write_patch", "approval_required")),
            apply_patch=str(policies.get("apply_patch", "approval_required")),
            run_test=str(policies.get("run_test", "auto")),
            run_lint=str(policies.get("run_lint", "auto")),
            run_command=str(policies.get("run_command", "approval_required")),
            mcp_call=str(policies.get("mcp_call", "depends_on_effect")),
            write_memory=str(policies.get("write_memory", "confirm_if_long_term")),
        ),
    )

