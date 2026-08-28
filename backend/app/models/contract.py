from __future__ import annotations

from dataclasses import dataclass, field

from app.models.base import Serializable


@dataclass(slots=True)
class ProgramSpec(Serializable):
    mode: str = "orchestrator"
    roles: list[str] = field(default_factory=list)
    max_steps: int = 20


@dataclass(slots=True)
class EffectSet(Serializable):
    allow: list[str] = field(default_factory=list)
    deny: list[str] = field(default_factory=list)


@dataclass(slots=True)
class CostEnvelope(Serializable):
    max_steps: int = 20
    max_model_calls: int = 20
    max_tool_calls: int = 60
    max_input_tokens: int = 120000
    max_output_tokens: int = 20000
    max_wall_time_seconds: int = 600


@dataclass(slots=True)
class PolicySet(Serializable):
    read_file: str = "auto"
    search_code: str = "auto"
    list_files: str = "auto"
    write_patch: str = "approval_required"
    apply_patch: str = "approval_required"
    run_test: str = "auto"
    run_lint: str = "auto"
    run_command: str = "approval_required"
    mcp_call: str = "depends_on_effect"
    write_memory: str = "confirm_if_long_term"


@dataclass(slots=True)
class AgentContract(Serializable):
    agent_id: str
    config_version: str = "v1"
    program: ProgramSpec = field(default_factory=ProgramSpec)
    effects: EffectSet = field(default_factory=EffectSet)
    cost_envelope: CostEnvelope = field(default_factory=CostEnvelope)
    policies: PolicySet = field(default_factory=PolicySet)

