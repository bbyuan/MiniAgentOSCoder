from __future__ import annotations

from dataclasses import dataclass, field

from app.models import ActionObservation, ActiveSkill, ToolDescriptor
from app.models.base import Serializable


INSPECTION_TOOLS = frozenset({"git_diff", "git_status", "list_files", "read_file", "search_code"})
VERIFICATION_TOOLS = frozenset({*INSPECTION_TOOLS, "run_lint", "run_test"})
TOOL_ALIASES = {"write_patch": "apply_patch"}


@dataclass(slots=True)
class CapabilityMenu(Serializable):
    phase: str
    tools: list[ToolDescriptor] = field(default_factory=list)
    hidden_tools: list[str] = field(default_factory=list)
    reason: str = ""

    def trace_payload(self) -> dict[str, object]:
        return {
            "phase": self.phase,
            "tools": [tool.name for tool in self.tools],
            "tool_count": len(self.tools),
            "hidden_tools": list(self.hidden_tools),
            "hidden_count": len(self.hidden_tools),
            "reason": self.reason,
        }


def build_capability_menu(
    tools: list[ToolDescriptor],
    *,
    mode: str,
    allowed_effects: list[str],
    observations: list[ActionObservation],
    active_skills: list[ActiveSkill] | None = None,
) -> CapabilityMenu:
    phase = capability_phase(observations)
    contract_tools = [tool for tool in tools if tool.effect in allowed_effects]

    if mode in {"Chat", "Review"}:
        selected = [tool for tool in contract_tools if tool.effect == "fs.read"]
        reason = "read_only_mode"
    elif phase == "inspect":
        selected = [tool for tool in contract_tools if tool.name in INSPECTION_TOOLS or tool.effect == "fs.read"]
        reason = "inspection_before_effects"
    elif phase == "verify":
        selected = [tool for tool in contract_tools if tool.name in VERIFICATION_TOOLS or tool.effect == "fs.read"]
        reason = "verify_latest_change"
    else:
        selected = contract_tools
        reason = "repair_after_failure" if phase == "repair" else "task_work"

    if not selected:
        selected = contract_tools
        reason = "contract_fallback"

    preferred = _preferred_tools(active_skills or [])
    original_order = {tool.name: index for index, tool in enumerate(tools)}
    selected.sort(
        key=lambda tool: (
            preferred.index(tool.name) if tool.name in preferred else len(preferred),
            original_order[tool.name],
        )
    )
    selected_names = {tool.name for tool in selected}
    return CapabilityMenu(
        phase=phase,
        tools=selected,
        hidden_tools=[tool.name for tool in tools if tool.name not in selected_names],
        reason=reason,
    )


def capability_phase(observations: list[ActionObservation]) -> str:
    effects = [item for item in observations if item.action_type not in {"use_skill", "user_guidance"}]
    if not effects:
        return "inspect"

    latest_failed_test = next(
        (index for index in range(len(effects) - 1, -1, -1) if effects[index].action_type == "run_test" and not effects[index].ok),
        None,
    )
    latest_patch = next(
        (index for index in range(len(effects) - 1, -1, -1) if effects[index].action_type == "apply_patch" and effects[index].ok),
        None,
    )
    latest_successful_test = next(
        (index for index in range(len(effects) - 1, -1, -1) if effects[index].action_type == "run_test" and effects[index].ok),
        None,
    )
    if latest_failed_test is not None and (latest_patch is None or latest_failed_test > latest_patch):
        return "repair"
    if latest_patch is not None and (latest_successful_test is None or latest_patch > latest_successful_test):
        return "verify"
    return "work"


def _preferred_tools(skills: list[ActiveSkill]) -> list[str]:
    preferred: list[str] = []
    for skill in skills:
        default_tools = getattr(skill, "default_tools", [])
        for value in default_tools:
            tool = TOOL_ALIASES.get(value, value)
            if tool not in preferred:
                preferred.append(tool)
    return preferred
