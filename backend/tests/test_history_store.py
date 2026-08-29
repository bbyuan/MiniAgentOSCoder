from pathlib import Path

from app.models import (
    CompletionAssessment,
    CompletionCheck,
    RunArtifacts,
    RunLoopResult,
    RunPhase,
    RunState,
    TestSummary as RunTestSummary,
)
from app.runtime.history_store import HistoryStore, stable_project_id


def _project(store: HistoryStore, root: Path) -> dict[str, object]:
    return store.upsert_project(root, {"name": root.name, "languages": ["Python"]})


def test_project_identity_is_stable_and_tracks_latest_run(tmp_path: Path) -> None:
    store = HistoryStore()
    first = _project(store, tmp_path)
    second = _project(store, tmp_path)
    run = RunState(run_id="run-one", task="Fix parser", status=RunPhase.PLANNING)

    store.record_run(run, str(first["project_id"]), tmp_path)
    projects = store.list_projects()

    assert first["project_id"] == second["project_id"] == stable_project_id(tmp_path)
    assert len(projects) == 1
    assert projects[0]["run_count"] == 1
    assert projects[0]["latest_status"] == "planning"


def test_run_summary_updates_and_supports_filters_and_archive(tmp_path: Path) -> None:
    store = HistoryStore()
    project = _project(store, tmp_path)
    run = RunState(run_id="run-two", task="Repair failing API test", status=RunPhase.PLANNING)
    store.record_run(run, str(project["project_id"]), tmp_path)

    run.status = RunPhase.COMPLETED
    run.current_step = 4
    run.changed_files = ["app.py"]
    run.applied_patches = 1
    result = RunLoopResult(
        run_id=run.run_id,
        status=RunPhase.COMPLETED,
        termination_reason="finish",
        steps=4,
        model_calls=2,
        tool_calls=3,
        token_usage={"input_tokens": 90, "output_tokens": 30, "total_tokens": 120},
        final_message="Done",
        completion=CompletionAssessment(
            verdict="passed",
            mode="Bugfix",
            checks=[CompletionCheck(id="tests_after_change", passed=True, evidence="pytest passed")],
            summary="All checks passed",
        ),
    )
    artifacts = RunArtifacts(run_id=run.run_id, test_summary=RunTestSummary(status="Passed"))
    store.update_run(run, result=result, artifacts=artifacts)

    runs, total = store.list_runs(query="API", status="completed")
    saved = store.get_run(run.run_id)

    assert total == 1
    assert runs[0]["total_tokens"] == 120
    assert saved is not None
    assert saved["changed_files"] == ["app.py"]
    assert saved["test_status"] == "Passed"
    assert saved["completion"]["verdict"] == "passed"
    assert saved["completion"]["checks"][0]["id"] == "tests_after_change"
    assert saved["completed_at"] is not None
    assert store.set_archived(run.run_id, True)
    assert store.list_runs()[1] == 0
    assert store.list_runs(include_archived=True)[1] == 1


def test_resource_samples_are_mode_scoped_and_numeric_only(tmp_path: Path) -> None:
    store = HistoryStore()
    project = _project(store, tmp_path)
    for index, mode in enumerate(("Bugfix", "Bugfix", "Review"), start=1):
        run = RunState(
            run_id=f"sample-{index}",
            task=f"Sensitive task {index}",
            mode=mode,
            status=RunPhase.COMPLETED,
        )
        store.record_run(run, str(project["project_id"]), tmp_path)
        store.update_run(
            run,
            result=RunLoopResult(
                run_id=run.run_id,
                status=RunPhase.COMPLETED,
                termination_reason="finish",
                steps=index,
                model_calls=index,
                tool_calls=index + 1,
                token_usage={"input_tokens": index * 100, "output_tokens": index * 10},
            ),
        )

    samples = store.list_resource_samples(str(project["project_id"]), "Bugfix")

    assert len(samples) == 2
    assert {sample["model_calls"] for sample in samples} == {1, 2}
    assert set(samples[0]) == {
        "steps",
        "model_calls",
        "tool_calls",
        "input_tokens",
        "output_tokens",
        "created_at",
        "completed_at",
    }
    assert "task" not in str(samples)
    assert str(tmp_path) not in str(samples)


def test_reopen_marks_non_terminal_runs_interrupted(tmp_path: Path) -> None:
    database = tmp_path / "runtime" / "state.db"
    first = HistoryStore(database)
    project = _project(first, tmp_path)
    run = RunState(run_id="run-three", task="Continue after restart", status=RunPhase.RUNNING)
    first.record_run(run, str(project["project_id"]), tmp_path)
    first.close()

    reopened = HistoryStore(database)
    assert reopened.mark_interrupted() == 1
    saved = reopened.get_run(run.run_id)

    assert saved is not None
    assert saved["status"] == "interrupted"
    assert saved["completed_at"] is not None
    reopened.close()


def test_reopen_run_clears_terminal_result_and_preserves_usage(tmp_path: Path) -> None:
    store = HistoryStore()
    project = _project(store, tmp_path)
    run = RunState(
        run_id="run-resume",
        task="Continue safely",
        status=RunPhase.FAILED,
        current_step=3,
        budget={"model_calls": 2, "tool_calls": 1, "total_tokens": 120},
    )
    store.record_run(run, str(project["project_id"]), tmp_path)
    store.update_run(
        run,
        result=RunLoopResult(
            run_id=run.run_id,
            status=RunPhase.FAILED,
            termination_reason="worker_error",
            steps=3,
            final_message="stopped",
        ),
    )

    run.status = RunPhase.PLANNING
    assert store.reopen_run(run)
    saved = store.get_run(run.run_id)

    assert saved is not None
    assert saved["status"] == "planning"
    assert saved["completed_at"] is None
    assert saved["termination_reason"] == ""
    assert saved["final_message"] == ""
    assert saved["steps"] == 3


def test_conversation_lineage_is_persisted_and_ordered(tmp_path: Path) -> None:
    database = tmp_path / "runtime" / "state.db"
    store = HistoryStore(database)
    project = _project(store, tmp_path)
    root = RunState(
        run_id="run-root",
        task="Inspect parser",
        conversation_id="run-root",
        status=RunPhase.COMPLETED,
    )
    follow_up = RunState(
        run_id="run-follow-up",
        task="Now fix it",
        conversation_id="run-root",
        parent_run_id="run-root",
        turn_index=1,
        status=RunPhase.PLANNING,
    )

    store.record_run(root, str(project["project_id"]), tmp_path)
    store.record_run(follow_up, str(project["project_id"]), tmp_path)
    store.close()

    reopened = HistoryStore(database)
    conversation = reopened.list_conversation("run-follow-up")

    assert [run["run_id"] for run in conversation] == ["run-root", "run-follow-up"]
    assert conversation[1]["parent_run_id"] == "run-root"
    assert conversation[1]["conversation_id"] == "run-root"
    assert conversation[1]["turn_index"] == 1
    reopened.close()


def test_existing_database_adds_runtime_columns_without_losing_runs(tmp_path: Path) -> None:
    database = tmp_path / "legacy.db"
    store = HistoryStore(database)
    project = _project(store, tmp_path)
    run = RunState(run_id="legacy-run", task="Legacy", status=RunPhase.PLANNING)
    store.record_run(run, str(project["project_id"]), tmp_path)
    store._connection.execute("ALTER TABLE runs RENAME TO runs_current")
    store._connection.execute(
        "CREATE TABLE runs AS SELECT "
        + ", ".join(
            row[1]
            for row in store._connection.execute("PRAGMA table_info(runs_current)").fetchall()
            if row[1] not in {"completion_json", "conversation_id", "parent_run_id", "turn_index"}
        )
        + " FROM runs_current"
    )
    store._connection.execute("DROP TABLE runs_current")
    store._connection.commit()
    store.close()

    reopened = HistoryStore(database)
    saved = reopened.get_run("legacy-run")

    assert saved is not None
    assert saved["completion"] is None
    assert saved["conversation_id"] == "legacy-run"
    assert saved["parent_run_id"] is None
    assert saved["turn_index"] == 0
    reopened.close()
