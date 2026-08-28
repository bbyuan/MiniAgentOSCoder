from __future__ import annotations

from dataclasses import dataclass

from app.models import ActionIR, AgentContract, ContextPack, ToolDescriptor
from app.models.base import Serializable
from app.runtime.action_parser import ActionParseError, parse_action_ir
from app.runtime.model_client import ModelClient, ModelMessage, ModelRequest, ModelResponse
from app.runtime.tracer import TraceWriter


@dataclass(slots=True)
class PlannerDecision(Serializable):
    action: ActionIR
    response: ModelResponse


def build_action_request(
    task: str,
    contract: AgentContract,
    tools: list[ToolDescriptor],
    context_pack: ContextPack | None = None,
    model: str | None = None,
) -> ModelRequest:
    tool_lines = [
        f"- {tool.name}: effect={tool.effect}, risk={tool.risk.value}, params={sorted(tool.input_schema.keys())}"
        for tool in tools
    ]
    context_summary = "No context pack is available."
    if context_pack is not None:
        context_summary = "\n".join(
            f"- {item.path}: {item.summary} ({item.tokens} tokens)" for item in context_pack.items
        )

    system = (
        "You are MiniAgentOS Coder's planner. Return exactly one JSON Action IR object. "
        "Do not include markdown or free-form explanations. Required fields: type, rationale, params."
    )
    user = "\n".join(
        [
            f"Task: {task}",
            f"Mode: {contract.program.mode}",
            f"Allowed effects: {', '.join(contract.effects.allow)}",
            "Available tools:",
            *tool_lines,
            "Context:",
            context_summary,
        ]
    )

    return ModelRequest(
        model=model or "static",
        messages=[
            ModelMessage(role="system", content=system),
            ModelMessage(role="user", content=user),
        ],
        metadata={"agent_id": contract.agent_id, "mode": contract.program.mode},
    )


def plan_next_action(
    run_id: str,
    task: str,
    contract: AgentContract,
    tools: list[ToolDescriptor],
    model_client: ModelClient,
    tracer: TraceWriter,
    context_pack: ContextPack | None = None,
) -> PlannerDecision:
    request = build_action_request(task=task, contract=contract, tools=tools, context_pack=context_pack)
    tracer.event(run_id, "model.requested", {"request": request.to_dict()}, role="Planner")

    response = model_client.complete(request)
    tracer.event(
        run_id,
        "model.responded",
        {"response": response.to_dict()},
        role="Planner",
    )

    try:
        action = parse_action_ir(response.content)
    except ActionParseError as exc:
        tracer.event(
            run_id,
            "action.rejected",
            {"error": str(exc), "raw_response": response.content},
            role="Planner",
        )
        raise
    return PlannerDecision(action=action, response=response)
