from __future__ import annotations

from collections.abc import Iterable

from app.models import AgentContract, ExtensionCatalog, ExtensionSettings, GovernanceSettings
from app.models.formal_program import FormalAgentProgram, FormalProgramGrade, FormalProgramLint, FormalProgramNode


ACTION_EFFECTS: dict[str, str] = {
    "list_files": "fs.read",
    "read_file": "fs.read",
    "search_code": "fs.read",
    "write_patch": "fs.write",
    "apply_patch": "fs.write",
    "run_test": "test.run",
    "run_lint": "test.run",
    "run_command": "shell.exec",
    "mcp_call": "mcp.call",
    "write_memory": "state.memory",
    "finish": "pure",
}

ACTION_LABELS: dict[str, str] = {
    "list_files": "Tool[list_files]",
    "read_file": "Tool[read_file]",
    "search_code": "Tool[search_code]",
    "write_patch": "Guard(Tool[write_patch], approval)",
    "apply_patch": "Guard(Tool[apply_patch], approval)",
    "run_test": "Tool[run_test]",
    "run_lint": "Tool[run_lint]",
    "run_command": "Guard(Tool[run_command], approval)",
    "mcp_call": "Guard(Tool[mcp_call], effect)",
    "write_memory": "Guard(Memory.write, confirm)",
    "finish": "Guard(Finish, evidence)",
}


def compile_formal_program(
    *,
    run_id: str,
    contract: AgentContract,
    governance: GovernanceSettings | None = None,
    extensions: ExtensionCatalog | None = None,
    extension_settings: ExtensionSettings | None = None,
) -> FormalAgentProgram:
    """Project MiniAgentOS Coder's runtime contract into a small λA/AgentOS-style term."""

    allowed_actions = _allowed_actions(contract)
    route_children = [
        FormalProgramNode(
            id=f"action-{action}",
            op="Tool" if "Guard" not in ACTION_LABELS[action] else "Guard",
            label=ACTION_LABELS[action],
            detail=f"{ACTION_EFFECTS[action]} · policy={_policy_for(action, contract)}",
        )
        for action in allowed_actions
    ]
    skill_nodes = _skill_nodes(extensions, extension_settings)
    mcp_nodes = _mcp_nodes(extensions, extension_settings)
    hook_nodes = _hook_nodes(extensions, extension_settings)

    nodes = [
        FormalProgramNode(
            id="memory",
            op="Memory",
            label="Memory(project, long_term)",
            detail="Run context may read project memory and propose governed writes.",
            children=[
                FormalProgramNode(
                    id="guard",
                    op="Guard",
                    label="Guard(completion, policy, sandbox)",
                    detail=f"sandbox={getattr(governance.sandbox_profile, 'value', 'standard') if governance else 'standard'}",
                    children=[
                        FormalProgramNode(
                            id="loop",
                            op="Loop",
                            label=f"Loop(max_steps={contract.cost_envelope.max_steps})",
                            detail="Bounded ReAct loop: Think -> Parse -> Route -> Invoke -> Observe -> Check.",
                            children=[
                                FormalProgramNode(
                                    id="planner",
                                    op="LLM",
                                    label=f"λmodel[{contract.program.mode}]",
                                    detail="Planner emits ActionIR constrained by the capability menu.",
                                ),
                                FormalProgramNode(
                                    id="route",
                                    op="Route",
                                    label="Route(ActionIR.type)",
                                    detail=f"{len(route_children)} actions are reachable under the current effect contract.",
                                    children=route_children,
                                ),
                            ],
                        )
                    ],
                )
            ],
        )
    ]
    if skill_nodes:
        nodes.append(FormalProgramNode(id="skills", op="Skill", label="Skill transforms", detail=f"{len(skill_nodes)} active", children=skill_nodes))
    if mcp_nodes:
        nodes.append(FormalProgramNode(id="mcp", op="MCP", label="MCP tools", detail=f"{len(mcp_nodes)} enabled", children=mcp_nodes))
    if hook_nodes:
        nodes.append(FormalProgramNode(id="hooks", op="Hook", label="Effect handlers", detail=f"{len(hook_nodes)} enabled", children=hook_nodes))

    term = _term(contract, allowed_actions, skill_nodes, mcp_nodes, hook_nodes)
    return FormalAgentProgram(
        run_id=run_id,
        calculus="MiniAgent DSL / λA projection",
        source="AgentContract + Skill/MCP/Hook manifests + runtime governance",
        input_type="Task × Workspace × Memory",
        output_type="Patch × Evidence × FinalMessage",
        term=term,
        effect=_effect_expression(contract, allowed_actions),
        grade=FormalProgramGrade(
            steps=contract.cost_envelope.max_steps,
            model_calls=contract.cost_envelope.max_model_calls,
            tool_calls=contract.cost_envelope.max_tool_calls,
            input_tokens=contract.cost_envelope.max_input_tokens,
            output_tokens=contract.cost_envelope.max_output_tokens,
            wall_time_seconds=contract.cost_envelope.max_wall_time_seconds,
            expression=(
                f"≤ {contract.cost_envelope.max_steps} steps, "
                f"≤ {contract.cost_envelope.max_model_calls} LLM calls, "
                f"≤ {contract.cost_envelope.max_tool_calls} tool calls"
            ),
        ),
        nodes=nodes,
        lints=_semantic_lints(contract, governance, extensions, extension_settings),
        trace_rules=[
            "C-LLM: model.requested/model.responded",
            "C-Route: action.parsed",
            "C-Tool: tool.executed/tool.failed",
            "C-Guard: policy.evaluated/action.rejected",
            "C-Mem: memory.loaded/memory.written",
        ],
        highlights=[
            "Prompt layers compile into the planner term.",
            "Tool calls are checked by inferred effects before execution.",
            "Budget grade is enforced by admission and the run loop.",
            "Skills, MCP servers and hooks are explicit program extensions.",
        ],
    )


def _allowed_actions(contract: AgentContract) -> list[str]:
    allowed = set(contract.effects.allow)
    actions = [
        action
        for action, effect in ACTION_EFFECTS.items()
        if effect == "pure" or effect in allowed
    ]
    return [action for action in actions if _policy_for(action, contract) != "deny"]


def _policy_for(action: str, contract: AgentContract) -> str:
    policy_name = "apply_patch" if action == "write_patch" else action
    return str(getattr(contract.policies, policy_name, "auto"))


def _term(
    contract: AgentContract,
    actions: list[str],
    skills: list[FormalProgramNode],
    mcp: list[FormalProgramNode],
    hooks: list[FormalProgramNode],
) -> str:
    route_body = "\n      | ".join(f"{action} -> {ACTION_LABELS[action]}" for action in actions)
    extension_lines = []
    if skills:
        extension_lines.append(f"SkillSet[{', '.join(node.label for node in skills)}]")
    if mcp:
        extension_lines.append(f"MCPRegistry[{', '.join(node.label for node in mcp)}]")
    if hooks:
        extension_lines.append(f"Handlers[{', '.join(node.label for node in hooks)}]")
    extensions = "\n  >> " + "\n  >> ".join(extension_lines) if extension_lines else ""
    return (
        f"Memory(\n"
        f"  Guard(\n"
        f"    Loop(max_steps={contract.cost_envelope.max_steps},\n"
        f"      λmodel[{contract.program.mode}](Task, Context) -> ActionIR\n"
        f"      >> Route(ActionIR.type,\n"
        f"      | {route_body}\n"
        f"      )\n"
        f"      >> Observe\n"
        f"      >> CheckEvidence\n"
        f"    ),\n"
        f"    sandbox ∧ policies ∧ completion_guard\n"
        f"  ){extensions}\n"
        f")"
    )


def _effect_expression(contract: AgentContract, actions: list[str]) -> str:
    effects = []
    for action in actions:
        effect = ACTION_EFFECTS[action]
        if effect != "pure" and effect not in effects:
            effects.append(effect)
    denied = ", ".join(contract.effects.deny) if contract.effects.deny else "∅"
    allowed = " ⊔ ".join(effects) if effects else "pure"
    return f"allow({allowed}) ∧ deny({denied})"


def _semantic_lints(
    contract: AgentContract,
    governance: GovernanceSettings | None,
    extensions: ExtensionCatalog | None,
    settings: ExtensionSettings | None,
) -> list[FormalProgramLint]:
    policies = contract.policies
    lints = [
        _lint("bounded_loop", contract.cost_envelope.max_steps > 0, f"max_steps={contract.cost_envelope.max_steps}"),
        _lint("model_budget", contract.cost_envelope.max_model_calls > 0, f"max_model_calls={contract.cost_envelope.max_model_calls}"),
        _lint("tool_budget", contract.cost_envelope.max_tool_calls > 0, f"max_tool_calls={contract.cost_envelope.max_tool_calls}"),
        _lint("write_guard", policies.apply_patch == "approval_required", f"apply_patch={policies.apply_patch}"),
        _lint("command_guard", policies.run_command == "approval_required", f"run_command={policies.run_command}"),
        _lint("memory_guard", policies.write_memory in {"confirm_if_long_term", "approval_required", "auto"}, f"write_memory={policies.write_memory}"),
        _lint("workspace_escape_denied", "workspace.escape" in contract.effects.deny, f"deny={', '.join(contract.effects.deny) or '∅'}"),
        _lint("secret_read_denied", "secret.read" in contract.effects.deny, f"deny={', '.join(contract.effects.deny) or '∅'}"),
        _lint("completion_guard", True, "Finish requires final message and evidence checks."),
    ]
    sandbox = getattr(governance.sandbox_profile, "value", "standard") if governance else "standard"
    lints.append(_lint("sandbox_declared", sandbox in {"standard", "strict"}, f"sandbox={sandbox}"))

    if extensions is not None and settings is not None:
        skill_ids = {skill.id for skill in extensions.skills if skill.valid}
        mcp_ids = {server.id for server in extensions.mcp_servers if server.valid}
        hook_ids = {hook.id for hook in extensions.hooks if hook.valid}
        lints.extend([
            _lint("skills_resolve", set(settings.active_skill_ids).issubset(skill_ids), _missing(settings.active_skill_ids, skill_ids)),
            _lint("mcp_resolve", set(settings.enabled_mcp_server_ids).issubset(mcp_ids), _missing(settings.enabled_mcp_server_ids, mcp_ids)),
            _lint("hooks_resolve", set(settings.enabled_hook_ids).issubset(hook_ids), _missing(settings.enabled_hook_ids, hook_ids)),
        ])
    return lints


def _lint(identifier: str, passed: bool, evidence: str) -> FormalProgramLint:
    return FormalProgramLint(
        id=identifier,
        status="passed" if passed else "warning",
        summary=identifier.replace("_", " "),
        evidence=evidence,
    )


def _missing(selected: Iterable[str], available: set[str]) -> str:
    missing = [item for item in selected if item not in available]
    return "all selected entries resolve" if not missing else f"missing: {', '.join(missing)}"


def _skill_nodes(extensions: ExtensionCatalog | None, settings: ExtensionSettings | None) -> list[FormalProgramNode]:
    if extensions is None or settings is None:
        return []
    by_id = {skill.id: skill for skill in extensions.skills}
    nodes = []
    for skill_id in settings.active_skill_ids:
        skill = by_id.get(skill_id)
        if skill is None:
            continue
        nodes.append(
            FormalProgramNode(
                id=f"skill-{skill.id}",
                op="Skill",
                label=skill.id,
                detail=f"risk={skill.risk} · tools={len(skill.default_tools)}",
            )
        )
    return nodes


def _mcp_nodes(extensions: ExtensionCatalog | None, settings: ExtensionSettings | None) -> list[FormalProgramNode]:
    if extensions is None or settings is None:
        return []
    by_id = {server.id: server for server in extensions.mcp_servers}
    return [
        FormalProgramNode(
            id=f"mcp-{server.id}",
            op="MCP",
            label=server.id,
            detail=f"{server.transport} · effect={server.effect}",
        )
        for server_id in settings.enabled_mcp_server_ids
        if (server := by_id.get(server_id)) is not None
    ]


def _hook_nodes(extensions: ExtensionCatalog | None, settings: ExtensionSettings | None) -> list[FormalProgramNode]:
    if extensions is None or settings is None:
        return []
    by_id = {hook.id: hook for hook in extensions.hooks}
    return [
        FormalProgramNode(
            id=f"hook-{hook.id}",
            op="Hook",
            label=hook.id,
            detail=f"{hook.event.value} · {hook.failure_policy.value}",
        )
        for hook_id in settings.enabled_hook_ids
        if (hook := by_id.get(hook_id)) is not None
    ]
