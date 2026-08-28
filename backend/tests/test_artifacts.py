from app.models import RunState
from app.runtime.artifacts import build_initial_plan, build_run_artifacts


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
    assert context_pack.required_items == ["user_task", "project_profile"]
