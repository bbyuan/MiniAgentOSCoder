from pathlib import Path

from fastapi.testclient import TestClient

from app.api.store import store
from app.main import create_app


def make_client() -> TestClient:
    store.projects.clear()
    store.runs.clear()
    store.contracts.clear()
    store.contexts.clear()
    store.approvals.clear()
    store.current_project_id = None
    return TestClient(create_app())


def test_health_endpoint() -> None:
    client = make_client()

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_open_project_scans_workspace(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname='demo'\n", encoding="utf-8")
    (tmp_path / "app.py").write_text("def main(): pass\n", encoding="utf-8")
    client = make_client()

    response = client.post("/projects/open", json={"path": str(tmp_path)})

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["profile_path"] == ".agent/project-profile.json"
    assert (tmp_path / ".agent" / "index" / "files.json").exists()


def test_create_run_and_read_trace(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname='demo'\n", encoding="utf-8")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    run_response = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "fix bug", "mode": "Bugfix"},
    )
    run = run_response.json()
    trace = client.get(f"/runs/{run['run_id']}/trace").json()
    context = client.get(f"/runs/{run['run_id']}/context").json()

    assert run_response.status_code == 200
    assert run["status"] == "planning"
    assert run["contract"]["agent_id"] == "miniagent-coder"
    assert trace["events"][0]["event"] == "run.created"
    assert context["required_items"] == ["user_task", "project_profile"]


def test_cancel_run(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post("/runs", json={"project_id": project["project_id"], "task": "stop", "mode": "Bugfix"}).json()

    response = client.post(f"/runs/{run['run_id']}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_events_and_replay_follow_trace_contract(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post("/runs", json={"project_id": project["project_id"], "task": "trace", "mode": "Bugfix"}).json()

    events = client.get(f"/runs/{run['run_id']}/events").json()
    replay = client.post(f"/runs/{run['run_id']}/replay").json()

    assert events["events"][0]["event"] == "run.created"
    assert replay["replayed"] is True
    assert replay["events"][0]["event"] == "run.created"


def test_approval_endpoint_returns_conflict_without_pending_approval(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post("/runs", json={"project_id": project["project_id"], "task": "approval", "mode": "Bugfix"}).json()

    response = client.post(f"/runs/{run['run_id']}/approve", json={"approval_id": "missing", "mode": "approve_once"})

    assert response.status_code == 409
