from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from app.models import RunPhase, RunState
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.state_machine import transition_run
from app.runtime.tracer import TraceWriter


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

