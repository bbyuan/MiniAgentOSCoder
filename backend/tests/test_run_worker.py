from pathlib import Path

import pytest

from app.models import ContextPack, RunLoopResult, RunPhase, RunState
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_client import QueuedStaticModelClient
from app.runtime.run_worker import RunJob, RunWorker, RunWorkerConflict
from app.runtime.tracer import TraceWriter


ROOT = Path(__file__).resolve().parents[2]


def make_job(
    tmp_path: Path,
    *,
    run_id: str = "run-worker-001",
) -> tuple[RunJob, list[RunLoopResult]]:
    run = RunState(run_id=run_id, task="finish", status=RunPhase.PLANNING)
    contract = compile_agent_contract(ROOT / ".agent" / "config.yaml")
    results: list[RunLoopResult] = []
    job = RunJob(
        run=run,
        workspace=tmp_path,
        contract=contract,
        context_pack=ContextPack(run_id=run_id),
        model_client=QueuedStaticModelClient(
            ['{"type":"finish","rationale":"done","params":{"message":"worker complete"}}']
        ),
        tracer=TraceWriter(tmp_path / "runs"),
        on_result=results.append,
    )
    return job, results


def test_run_worker_executes_prepared_run_and_updates_state(tmp_path: Path) -> None:
    worker = RunWorker()
    job, results = make_job(tmp_path)

    worker.prepare(job)
    result = worker.execute(job)

    assert result.status == RunPhase.COMPLETED
    assert job.run.status == RunPhase.COMPLETED
    assert job.run.current_step == 1
    assert job.run.budget["model_calls"] == 1
    assert results == [result]
    assert worker.is_active(job.run.run_id) is False
    events = [event["event"] for event in job.tracer.read_events(job.run.run_id)]
    assert events[0] == "run.transitioned"
    assert events[-2:] == ["run.finished", "run.transitioned"]


def test_run_worker_rejects_duplicate_prepare(tmp_path: Path) -> None:
    worker = RunWorker()
    job, _ = make_job(tmp_path)

    worker.prepare(job)

    with pytest.raises(RunWorkerConflict, match="already active"):
        worker.prepare(job)
    worker.cancel(job.run.run_id)
    result = worker.execute(job)
    assert result.status == RunPhase.CANCELLED


def test_run_worker_honors_cancel_before_execution(tmp_path: Path) -> None:
    worker = RunWorker()
    job, _ = make_job(tmp_path, run_id="run-worker-cancel")

    worker.prepare(job)
    assert worker.cancel(job.run.run_id) is True
    result = worker.execute(job)

    assert result.status == RunPhase.CANCELLED
    assert result.model_calls == 0
    assert job.run.status == RunPhase.CANCELLED
