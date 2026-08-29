from datetime import datetime, timezone
from pathlib import Path

from app.models import CompletionAssessment, CompletionCheck, ContextPack, RunArtifacts, RunLoopResult, RunPhase, RunState
from app.runtime.artifacts import build_initial_plan, build_run_artifacts
from app.runtime.contract_compiler import compile_agent_contract
from app.runtime.run_artifact_writer import RunArtifactWriter


ROOT = Path(__file__).resolve().parents[2]


def test_build_initial_plan_contains_runtime_steps() -> None:
    plan = build_initial_plan("Bugfix", {"test_commands": ["pytest"]})

    assert [step.id for step in plan] == ["scan", "contract", "context", "inspect", "patch", "test", "report"]
    assert plan[2].state == "active"


def test_build_run_artifacts_includes_context_and_trace_summary() -> None:
    run = RunState(run_id="run-001", task="fix bug", mode="Bugfix")

    artifacts, context_pack = build_run_artifacts(
        run,
        {"test_commands": ["pytest"], "languages": ["python"]},
        [{"event": "run.created"}, {"event": "contract.compiled"}],
    )

    assert artifacts.run_id == "run-001"
    assert artifacts.context_explanation[0]["id"] == "user_task"
    assert artifacts.trace_summary == ["run.created", "contract.compiled"]
    assert context_pack.required_items == ["user_task", "project_profile", "current_plan"]


def test_run_artifact_writer_appends_patches_and_redacts_report(tmp_path: Path) -> None:
    writer = RunArtifactWriter(
        tmp_path,
        "run-report",
        now=lambda: datetime(2026, 8, 28, tzinfo=timezone.utc),
    )
    writer.append_patch("--- a/app.py\n+++ b/app.py\n-old\n+new\n", 1)
    writer.append_patch("--- a/app.py\n+++ b/app.py\n-new\n+fixed\n", 2)
    run = RunState(
        run_id="run-report",
        task="fix app password=hunter2",
        mode="Bugfix",
        status=RunPhase.COMPLETED,
        changed_files=["app.py"],
        applied_patches=2,
        budget={"model_calls": 4, "model_cache_hits": 1, "tool_calls": 3, "total_tokens": 120},
    )
    result = RunLoopResult(
        run_id=run.run_id,
        status=RunPhase.COMPLETED,
        termination_reason="finish",
        steps=4,
        final_message="fixed password=hunter2",
        completion=CompletionAssessment(
            verdict="passed",
            mode="Bugfix",
            checks=[CompletionCheck(id="tests_after_change", passed=True, evidence="pytest passed")],
            summary="All checks passed",
        ),
    )

    report_path = writer.write_report(
        run=run,
        contract=compile_agent_contract(ROOT / ".agent" / "config.yaml"),
        context_pack=ContextPack(run_id=run.run_id, selected_items=["app.py", "tests/test_app.py"]),
        artifacts=RunArtifacts(run_id=run.run_id),
        result=result,
        trace_events=[{"event": "run.finished"}],
    )

    patches = writer.patch_path.read_text(encoding="utf-8")
    report = report_path.read_text(encoding="utf-8")
    assert patches.count("# Applied patch") == 2
    assert "-old" in patches and "+fixed" in patches
    assert "Applied patches: 2" in report
    assert "Trace events before report: 1" in report
    assert "Provider requests: 3" in report
    assert "Prompt cache hits: 1" in report
    assert "## Completion Guard" in report
    assert "`tests_after_change`: pytest passed" in report
    assert "2026-08-28T00:00:00+00:00" in report
    assert "hunter2" not in report
    assert "[REDACTED_SECRET]" in report
