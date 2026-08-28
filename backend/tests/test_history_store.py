from pathlib import Path

from app.models import RunArtifacts, RunLoopResult, RunPhase, RunState, TestSummary as RunTestSummary
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
    assert saved["completed_at"] is not None
    assert store.set_archived(run.run_id, True)
    assert store.list_runs()[1] == 0
    assert store.list_runs(include_archived=True)[1] == 1


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
