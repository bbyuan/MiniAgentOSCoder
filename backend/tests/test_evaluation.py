import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.store import store
from app.evaluation import build_evaluation_summary
from app.main import create_app
from app.models import RunArtifacts, RunLoopResult, RunPhase, RunState, TestSummary as RunTestSummary
from app.runtime.history_store import HistoryStore
from app.runtime.tracer import TraceWriter


def _record_terminal_run(
    history: HistoryStore,
    workspace: Path,
    *,
    run_id: str,
    status: RunPhase,
    reason: str,
    test_status: str,
) -> str:
    project = history.upsert_project(workspace, {"languages": ["python"]})
    run = RunState(run_id=run_id, task="private task text", status=RunPhase.PLANNING)
    history.record_run(run, str(project["project_id"]), workspace)
    run.status = status
    run.budget = {"model_calls": 2, "tool_calls": 3, "total_tokens": 120}
    result = RunLoopResult(
        run_id=run_id,
        status=status,
        termination_reason=reason,
        steps=4,
        model_calls=2,
        tool_calls=3,
        token_usage={"input_tokens": 90, "output_tokens": 30, "total_tokens": 120},
    )
    history.update_run(
        run,
        result=result,
        artifacts=RunArtifacts(run_id=run_id, test_summary=RunTestSummary(status=test_status)),
    )
    return str(project["project_id"])


def test_evaluation_aggregates_runs_and_trace_without_content(tmp_path: Path) -> None:
    history = HistoryStore()
    project_id = _record_terminal_run(
        history,
        tmp_path,
        run_id="run-complete",
        status=RunPhase.COMPLETED,
        reason="finish",
        test_status="Passed",
    )
    _record_terminal_run(
        history,
        tmp_path,
        run_id="run-failed",
        status=RunPhase.FAILED,
        reason="model_error",
        test_status="Failed",
    )
    tracer = TraceWriter(tmp_path / "runs")
    tracer.event("run-complete", "approval.requested", {"private": "source code"})
    tracer.event("run-complete", "approval.resolved", {"decision": "approve_once"})
    tracer.event("run-complete", "context.compacted", {})
    tracer.event(
        "run-failed",
        "policy.evaluated",
        {"evaluation": {"outcome": "denied", "reason": "private path"}},
    )

    summary = build_evaluation_summary(history, project_id=project_id)
    encoded = json.dumps(summary)

    assert summary["runs"] == {
        "total": 2,
        "terminal": 2,
        "active": 0,
        "status": {"completed": 1, "failed": 1},
    }
    assert summary["rates"] == {"completion": 0.5, "test_pass": 0.5, "patch_acceptance": 1.0}
    assert summary["averages"]["model_calls"] == 2.0
    assert summary["governance"]["guard_blocks"] == 1
    assert summary["governance"]["context_compactions"] == 1
    assert summary["failures"] == [{"category": "model_error", "count": 1, "share": 1.0}]
    assert summary["evidence"]["evidence_gaps"] == 0
    assert "private task text" not in encoded
    assert str(tmp_path) not in encoded
    assert "source code" not in encoded
    history.close()


def test_evaluation_reports_missing_and_malformed_trace_as_evidence_gaps(tmp_path: Path) -> None:
    history = HistoryStore()
    _record_terminal_run(
        history,
        tmp_path,
        run_id="run-missing",
        status=RunPhase.FAILED,
        reason="unexpected private failure detail",
        test_status="Not run",
    )
    _record_terminal_run(
        history,
        tmp_path,
        run_id="run-malformed",
        status=RunPhase.CANCELLED,
        reason="user_cancelled",
        test_status="Not run",
    )
    trace_path = tmp_path / "runs" / "run-malformed" / "trace.jsonl"
    trace_path.parent.mkdir(parents=True)
    trace_path.write_text("not-json\n", encoding="utf-8")

    summary = build_evaluation_summary(history)

    assert summary["rates"]["test_pass"] is None
    assert summary["evidence"] == {"trace_runs": 0, "evidence_gaps": 2}
    assert summary["failures"] == [
        {"category": "failed", "count": 1, "share": 0.5},
        {"category": "user_cancelled", "count": 1, "share": 0.5},
    ]
    history.close()


def test_evaluation_api_returns_an_empty_privacy_bounded_summary() -> None:
    store.worker.reset()
    client = TestClient(create_app())

    response = client.get("/evaluation/summary")

    assert response.status_code == 200
    assert response.json()["runs"]["total"] == 0
    assert response.json()["rates"]["completion"] is None
    assert response.json()["privacy"]["content_collected"] is False
