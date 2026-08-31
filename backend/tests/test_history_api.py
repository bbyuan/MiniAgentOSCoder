from pathlib import Path

from fastapi.testclient import TestClient

from app.api.store import store
from app.main import create_app
from app.models import Checkpoint, RunLoopResult, RunPhase
from app.runtime.checkpoint import CheckpointStore


def _client() -> TestClient:
    store.projects.clear()
    store.runs.clear()
    store.contracts.clear()
    store.contexts.clear()
    store.approvals.clear()
    store.artifacts.clear()
    store.run_results.clear()
    store.run_projects.clear()
    store.governance.clear()
    store.extension_catalogs.clear()
    store.extension_settings.clear()
    store.skills_registries.clear()
    store.worker.reset()
    store.current_project_id = None
    return TestClient(create_app())


def _open(client: TestClient, root: Path) -> dict[str, object]:
    response = client.post("/projects/open", json={"path": str(root)})
    assert response.status_code == 200
    return response.json()


def _create(client: TestClient, project_id: str, task: str) -> dict[str, object]:
    response = client.post(
        "/runs",
        json={"project_id": project_id, "task": task, "mode": "Bugfix"},
    )
    assert response.status_code == 200
    return response.json()


def test_history_lists_stable_projects_and_run_details(tmp_path: Path) -> None:
    client = _client()
    first = _open(client, tmp_path)
    second = _open(client, tmp_path)
    created = _create(client, str(first["project_id"]), "inspect persistent catalog")
    run_id = str(created["run_id"])
    run_dir = tmp_path / "runs" / run_id
    (run_dir / "report.md").write_text("# Run report\n\nPersistent evidence.\n", encoding="utf-8")
    (run_dir / "patch.diff").write_text(
        "diff --git a/app.py b/app.py\n--- a/app.py\n+++ b/app.py\n@@ -1 +1 @@\n-old\n+new\n",
        encoding="utf-8",
    )

    projects = client.get("/history/projects")
    runs = client.get("/history/runs", params={"query": "persistent"})
    detail = client.get(f"/history/runs/{run_id}")

    assert first["project_id"] == second["project_id"]
    assert projects.json()["total"] == 1
    assert projects.json()["projects"][0]["run_count"] == 1
    assert runs.json()["total"] == 1
    assert detail.status_code == 200
    assert detail.json()["report"]["available"] is True
    assert "Persistent evidence" in detail.json()["report"]["content"]
    assert detail.json()["patch"]["available"] is True
    assert "+new" in detail.json()["patch"]["content"]
    assert detail.json()["artifacts"]["patch"]["truncated"] is False
    assert detail.json()["trace"]["event_count"] >= 2
    assert detail.json()["resume"]["available"] is False


def test_history_detail_exposes_checkpoint_resume_availability(tmp_path: Path) -> None:
    client = _client()
    project = _open(client, tmp_path)
    created = _create(client, str(project["project_id"]), "continue after restart")
    run = store.runs[str(created["run_id"])]
    checkpoint = Checkpoint(
        checkpoint_id="latest-safe-point",
        run_id=run.run_id,
        step=2,
        status=RunPhase.RUNNING,
        run_state=run.to_dict(),
        context_summary="workspace and task",
    )
    CheckpointStore(tmp_path / "runs").save(checkpoint)
    run.status = RunPhase.FAILED
    store.history.update_run(run)

    detail = client.get(f"/history/runs/{run.run_id}")

    assert detail.status_code == 200
    assert detail.json()["resume"] == {
        "available": True,
        "checkpoint_count": 1,
        "latest_checkpoint_id": "latest-safe-point",
        "snapshot_available": False,
    }


def test_history_compares_and_archives_runs(tmp_path: Path) -> None:
    client = _client()
    project = _open(client, tmp_path)
    left = _create(client, str(project["project_id"]), "first attempt")
    right = _create(client, str(project["project_id"]), "second attempt")

    for index, created in enumerate((left, right), start=1):
        run = store.runs[str(created["run_id"])]
        run.status = RunPhase.COMPLETED
        result = RunLoopResult(
            run_id=run.run_id,
            status=RunPhase.COMPLETED,
            termination_reason="finish",
            steps=index,
            model_calls=index,
            tool_calls=index * 2,
            token_usage={"total_tokens": index * 100},
        )
        store.history.update_run(run, result=result, artifacts=store.artifacts[run.run_id])

    compared = client.post(
        "/history/compare",
        json={"run_ids": [left["run_id"], right["run_id"]]},
    )
    archived = client.put(
        f"/history/runs/{left['run_id']}/archive",
        json={"archived": True},
    )

    assert compared.status_code == 200
    total_tokens = next(item for item in compared.json()["metrics"] if item["key"] == "total_tokens")
    assert total_tokens == {"key": "total_tokens", "left": 100, "right": 200, "delta": 100}
    assert archived.json()["archived"] is True
    assert client.get("/history/runs").json()["total"] == 1
    assert client.get("/history/runs", params={"include_archived": True}).json()["total"] == 2


def test_history_rejects_invalid_comparisons_and_pagination() -> None:
    client = _client()

    assert client.post("/history/compare", json={"run_ids": ["same", "same"]}).status_code == 400
    assert client.post("/history/compare", json={"run_ids": ["only-one"]}).status_code == 422
    assert client.get("/history/runs", params={"limit": 101}).status_code == 422
    assert client.get("/history/runs/missing").status_code == 404
