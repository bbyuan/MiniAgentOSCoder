import json
from pathlib import Path
import time

import pytest

from app.models import ApprovalRequest, ContextPack, PlanStep, RunArtifacts, RunLoopResult, RunPhase, RunState
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.model_client import QueuedStaticModelClient
from app.runtime.run_worker import RunJob, RunWorker, RunWorkerConflict
from app.runtime.tracer import TraceWriter


ROOT = Path(__file__).resolve().parents[2]


def wait_until(predicate, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("Timed out waiting for worker state")


def make_job(
    tmp_path: Path,
    *,
    run_id: str = "run-worker-001",
) -> tuple[RunJob, list[RunLoopResult]]:
    run = RunState(run_id=run_id, task="finish", status=RunPhase.PLANNING, mode="Chat")
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
    assert events[-4:] == ["run.finished", "memory.written", "report.generated", "run.transitioned"]
    assert (tmp_path / "runs" / job.run.run_id / "report.md").exists()


def test_run_worker_finalizes_active_and_waiting_plan_steps(tmp_path: Path) -> None:
    job, _ = make_job(tmp_path, run_id="run-worker-plan")
    job.artifacts = RunArtifacts(
        run_id=job.run.run_id,
        plan=[
            PlanStep("scan", "Scan", "done"),
            PlanStep("context", "Context", "active"),
            PlanStep("test", "Test", "waiting"),
            PlanStep("report", "Report", "waiting"),
        ],
    )
    worker = RunWorker()

    worker.prepare(job)
    worker.execute(job)

    states = {step.id: step.state for step in job.artifacts.plan}
    assert states == {"scan": "done", "context": "done", "test": "skipped", "report": "done"}


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


def test_run_worker_waits_for_patch_approval_and_resumes_same_loop(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
"""
    responses = [
        json.dumps({"type": "apply_patch", "rationale": "fix bug", "params": {"patch": patch}}),
        json.dumps({
            "type": "run_test",
            "rationale": "verify patch",
            "params": {"command": "python3 -c \"assert open('app.py').read() == 'new\\n'\""},
        }),
        json.dumps({"type": "finish", "rationale": "done", "params": {"message": "fixed"}}),
    ]
    run = RunState(run_id="run-worker-approval", task="fix", status=RunPhase.PLANNING)
    approvals: list[ApprovalRequest] = []
    resolved: list[str] = []
    results: list[RunLoopResult] = []
    artifacts = RunArtifacts(run_id=run.run_id)
    job = RunJob(
        run=run,
        workspace=tmp_path,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        context_pack=ContextPack(run_id=run.run_id),
        model_client=QueuedStaticModelClient(responses),
        tracer=TraceWriter(tmp_path / "runs"),
        on_result=results.append,
        artifacts=artifacts,
        on_approval_requested=approvals.append,
        on_approval_resolved=resolved.append,
    )
    worker = RunWorker()

    worker.start(job)
    wait_until(lambda: len(approvals) == 1)

    approval = approvals[0]
    assert run.status == RunPhase.WAITING_APPROVAL
    assert approval.target["files"] == ["app.py"]
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "old\n"
    assert worker.resolve_approval(run.run_id, approval.approval_id, approved=True) is True
    wait_until(lambda: len(results) == 1)

    assert results[0].status == RunPhase.COMPLETED
    assert results[0].model_calls == 3
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "new\n"
    assert resolved == [approval.approval_id]
    assert artifacts.diff_summary.status == "Applied"
    assert artifacts.test_summary.status == "Passed"
    assert run.applied_patches == 1
    assert (tmp_path / "runs" / run.run_id / "patch.diff").read_text(encoding="utf-8").count("# Applied patch") == 1
    assert (tmp_path / "runs" / run.run_id / "report.md").exists()
    assert list((tmp_path / "runs" / run.run_id / "snapshots").rglob("manifest.json"))
    trace = job.tracer.read_events(run.run_id)
    events = [event["event"] for event in trace]
    approval_event = next(event for event in trace if event["event"] == "approval.requested")
    assert approval_event["payload"]["phase"] == "waiting_approval"
    assert "approval.requested" in events
    assert "approval.resolved" in events
    assert "patch.snapshot.created" in events


def test_run_worker_accepts_a_patch_after_a_successful_preflight_test(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
"""
    run = RunState(run_id="run-worker-test-then-patch", task="fix", status=RunPhase.PLANNING)
    approvals: list[ApprovalRequest] = []
    results: list[RunLoopResult] = []
    job = RunJob(
        run=run,
        workspace=tmp_path,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        context_pack=ContextPack(run_id=run.run_id),
        model_client=QueuedStaticModelClient([
            json.dumps({
                "type": "run_test",
                "rationale": "establish baseline",
                "params": {"command": "python3 -c \"assert open('app.py').read() == 'old\\n'\""},
            }),
            json.dumps({"type": "apply_patch", "rationale": "apply fix", "params": {"patch": patch}}),
            json.dumps({
                "type": "run_test",
                "rationale": "verify fix",
                "params": {"command": "python3 -c \"assert open('app.py').read() == 'new\\n'\""},
            }),
            json.dumps({"type": "finish", "rationale": "done", "params": {"message": "fixed"}}),
        ]),
        tracer=TraceWriter(tmp_path / "runs"),
        on_result=results.append,
        on_approval_requested=approvals.append,
    )
    worker = RunWorker()

    worker.start(job)
    wait_until(lambda: len(approvals) == 1)

    assert run.status == RunPhase.WAITING_APPROVAL
    assert worker.resolve_approval(run.run_id, approvals[0].approval_id, approved=True)
    wait_until(lambda: len(results) == 1)

    assert results[0].status == RunPhase.COMPLETED
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "new\n"


def test_run_worker_completes_bugfix_when_existing_behavior_is_already_correct(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("correct\n", encoding="utf-8")
    (tmp_path / "test_app.py").write_text(
        "import unittest\n\n"
        "class AppTest(unittest.TestCase):\n"
        "    def test_existing_behavior(self):\n"
        "        self.assertEqual(open('app.py').read(), 'correct\\n')\n",
        encoding="utf-8",
    )
    run = RunState(
        run_id="run-worker-already-correct",
        task="verify existing fix",
        status=RunPhase.PLANNING,
        mode="Bugfix",
    )
    results: list[RunLoopResult] = []
    job = RunJob(
        run=run,
        workspace=tmp_path,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        context_pack=ContextPack(run_id=run.run_id),
        model_client=QueuedStaticModelClient([
            json.dumps({"type": "read_file", "rationale": "inspect", "params": {"path": "app.py"}}),
            json.dumps({
                "type": "run_test",
                "rationale": "verify",
                "params": {"command": "python3 -m unittest -v"},
            }),
            json.dumps({
                "type": "finish",
                "rationale": "already correct",
                "params": {"message": "The requested behavior is already correct and verified."},
            }),
        ]),
        tracer=TraceWriter(tmp_path / "runs"),
        on_result=results.append,
        artifacts=RunArtifacts(run_id=run.run_id),
    )
    worker = RunWorker()

    worker.prepare(job)
    result = worker.execute(job)

    assert result.status == RunPhase.COMPLETED
    assert result.completion is not None
    assert result.completion.verdict == "passed"
    assert run.applied_patches == 0
    assert job.artifacts is not None
    assert job.artifacts.test_summary.passed == 1
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "correct\n"


def test_run_worker_does_not_accept_completion_after_denied_bugfix(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
"""
    run = RunState(run_id="run-worker-deny", task="fix", status=RunPhase.PLANNING)
    approvals: list[ApprovalRequest] = []
    results: list[RunLoopResult] = []
    job = RunJob(
        run=run,
        workspace=tmp_path,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        context_pack=ContextPack(run_id=run.run_id),
        model_client=QueuedStaticModelClient([
            json.dumps({"type": "apply_patch", "rationale": "fix", "params": {"patch": patch}}),
            json.dumps({"type": "finish", "rationale": "stopped", "params": {"message": "denied"}}),
        ]),
        tracer=TraceWriter(tmp_path / "runs"),
        on_result=results.append,
        on_approval_requested=approvals.append,
    )
    worker = RunWorker()

    worker.start(job)
    wait_until(lambda: len(approvals) == 1)
    assert worker.resolve_approval(
        run.run_id,
        approvals[0].approval_id,
        approved=False,
        reason="change is too broad",
    ) is True
    wait_until(lambda: len(results) == 1)

    assert results[0].status == RunPhase.FAILED
    assert results[0].termination_reason == "model_error"
    assert results[0].completion is not None
    assert results[0].completion.verdict == "blocked"
    assert "change_or_verified_existing" in results[0].completion.summary
    assert results[0].observations[0].metadata["approval_denied"] is True
    assert "change is too broad" in (results[0].observations[0].error or "")
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "old\n"


def test_run_worker_cancels_while_waiting_for_patch_approval(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
"""
    run = RunState(run_id="run-worker-approval-cancel", task="fix", status=RunPhase.PLANNING)
    approvals: list[ApprovalRequest] = []
    results: list[RunLoopResult] = []
    job = RunJob(
        run=run,
        workspace=tmp_path,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        context_pack=ContextPack(run_id=run.run_id),
        model_client=QueuedStaticModelClient([
            json.dumps({"type": "apply_patch", "rationale": "fix", "params": {"patch": patch}}),
        ]),
        tracer=TraceWriter(tmp_path / "runs"),
        on_result=results.append,
        on_approval_requested=approvals.append,
    )
    worker = RunWorker()

    worker.start(job)
    wait_until(lambda: len(approvals) == 1)
    assert worker.cancel(run.run_id) is True
    wait_until(lambda: len(results) == 1)

    assert results[0].status == RunPhase.CANCELLED
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "old\n"


def test_run_worker_steering_supersedes_waiting_patch_and_replans(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
"""
    run = RunState(run_id="run-worker-steer", task="fix", status=RunPhase.PLANNING, mode="Chat")
    approvals: list[ApprovalRequest] = []
    results: list[RunLoopResult] = []
    job = RunJob(
        run=run,
        workspace=tmp_path,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        context_pack=ContextPack(run_id=run.run_id),
        model_client=QueuedStaticModelClient([
            json.dumps({"type": "apply_patch", "rationale": "fix", "params": {"patch": patch}}),
            json.dumps({
                "type": "finish",
                "rationale": "replanned",
                "params": {"message": "Explained the issue without changing files."},
            }),
        ]),
        tracer=TraceWriter(tmp_path / "runs"),
        on_result=results.append,
        on_approval_requested=approvals.append,
    )
    worker = RunWorker()

    worker.start(job)
    wait_until(lambda: len(approvals) == 1)
    assert worker.steer(run.run_id, "Do not change the file; explain the issue only") is True
    wait_until(lambda: len(results) == 1)

    assert results[0].status == RunPhase.COMPLETED
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "old\n"
    assert any(item.action_type == "user_guidance" for item in results[0].observations)
    events = [event["event"] for event in job.tracer.read_events(run.run_id)]
    assert "approval.resolved" in events
    assert "user.guidance.applied" in events


def test_run_worker_repairs_failed_test_with_second_approved_patch(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    first_patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+bad
"""
    repair_patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-bad
+fixed
"""
    responses = [
        json.dumps({"type": "apply_patch", "rationale": "first fix", "params": {"patch": first_patch}}),
        json.dumps({
            "type": "run_test",
            "rationale": "verify first fix",
            "params": {"command": "python3 -c \"assert open('app.py').read() == 'fixed\\n'\""},
        }),
        json.dumps({"type": "apply_patch", "rationale": "repair failure", "params": {"patch": repair_patch}}),
        json.dumps({
            "type": "run_test",
            "rationale": "verify repair",
            "params": {"command": "python3 -c \"assert open('app.py').read() == 'fixed\\n'\""},
        }),
        json.dumps({"type": "finish", "rationale": "done", "params": {"message": "repaired"}}),
    ]
    run = RunState(run_id="run-worker-repair", task="fix", status=RunPhase.PLANNING)
    approvals: list[ApprovalRequest] = []
    results: list[RunLoopResult] = []
    job = RunJob(
        run=run,
        workspace=tmp_path,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        context_pack=ContextPack(run_id=run.run_id),
        model_client=QueuedStaticModelClient(responses),
        tracer=TraceWriter(tmp_path / "runs"),
        on_result=results.append,
        artifacts=RunArtifacts(run_id=run.run_id),
        on_approval_requested=approvals.append,
    )
    worker = RunWorker()

    worker.start(job)
    wait_until(lambda: len(approvals) == 1)
    assert worker.resolve_approval(run.run_id, approvals[0].approval_id, approved=True)
    wait_until(lambda: len(approvals) == 2)
    assert run.status == RunPhase.WAITING_APPROVAL
    assert run.repair_attempts == 1
    assert worker.resolve_approval(run.run_id, approvals[1].approval_id, approved=True)
    wait_until(lambda: len(results) == 1)

    assert results[0].status == RunPhase.COMPLETED
    assert run.repair_status == "completed"
    assert run.current_step == 5
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "fixed\n"
    events = [event["event"] for event in job.tracer.read_events(run.run_id)]
    assert events.count("approval.requested") == 2
    assert events.count("patch.snapshot.created") == 2
    assert events.count("patch.artifact.saved") == 2
    assert events.count("repair.started") == 1
    assert events.count("repair.completed") == 1
    assert run.applied_patches == 2
    assert (tmp_path / "runs" / run.run_id / "patch.diff").read_text(encoding="utf-8").count("# Applied patch") == 2
