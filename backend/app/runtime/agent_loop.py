from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from uuid import uuid4

from app.models import ActiveSkill, AgentContract, ContextPack, RunLoopResult, RunPhase, RunState, SkillManifest
from app.runtime.action_executor import ActionExecution, ActionExecutor
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_client import ModelClient
from app.runtime.planner import plan_next_action
from app.runtime.prompt_cache import PromptCache
from app.runtime.run_loop import AgentRunLoop
from app.runtime.state_machine import transition_run
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway


def create_runtime_run(task: str, workspace: str | Path, config_path: str | Path, runs_dir: str | Path = "runs") -> RunState:
    run = RunState(run_id=f"run-{uuid4().hex[:12]}", task=task)
    tracer = TraceWriter(runs_dir)
    tracer.event(run.run_id, "run.created", {"task": task, "workspace": str(workspace)})

    transition_run(run, RunPhase.SCANNING)
    tracer.event(run.run_id, "run.transitioned", {"status": run.status.value})

    contract = compile_agent_contract(config_path)
    tracer.event(run.run_id, "contract.compiled", {"contract": contract.to_dict()})

    transition_run(run, RunPhase.PLANNING)
    tracer.event(run.run_id, "run.transitioned", {"status": run.status.value})
    return run


def execute_next_model_action(
    *,
    run_id: str,
    task: str,
    contract: AgentContract,
    gateway: ToolGateway,
    model_client: ModelClient,
    tracer: TraceWriter,
    context_pack: ContextPack | None = None,
) -> ActionExecution:
    decision = plan_next_action(
        run_id=run_id,
        task=task,
        contract=contract,
        tools=gateway.list_tools(),
        model_client=model_client,
        tracer=tracer,
        context_pack=context_pack,
    )
    return ActionExecutor(gateway=gateway, tracer=tracer, run_id=run_id).execute(decision.action)


def execute_agent_run(
    *,
    run_id: str,
    task: str,
    contract: AgentContract,
    gateway: ToolGateway,
    model_client: ModelClient,
    tracer: TraceWriter,
    context_pack: ContextPack | None = None,
    prompt_cache: PromptCache | None = None,
    skill_cards: list[SkillManifest] | None = None,
    skill_loader: Callable[[str], ActiveSkill] | None = None,
) -> RunLoopResult:
    return AgentRunLoop(
        run_id=run_id,
        gateway=gateway,
        model_client=model_client,
        tracer=tracer,
        prompt_cache=prompt_cache,
        skill_loader=skill_loader,
    ).run(task=task, contract=contract, context_pack=context_pack, skill_cards=skill_cards)
