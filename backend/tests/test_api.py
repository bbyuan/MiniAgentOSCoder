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
    store.artifacts.clear()
    store.current_project_id = None
    return TestClient(create_app())


def test_health_endpoint() -> None:
    client = make_client()

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_cors_allows_local_workbench_origin() -> None:
    client = make_client()

    response = client.options(
        "/health",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


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
    artifacts = client.get(f"/runs/{run['run_id']}/artifacts").json()

    assert run_response.status_code == 200
    assert run["status"] == "planning"
    assert run["phase"] == "planning"
    assert run["contract"]["agent_id"] == "miniagent-coder"
    assert run["contract"]["effects"]["allow"]
    assert run["artifacts"]["plan"][0]["title"] == "Scan workspace"
    assert trace["events"][0]["event"] == "run.created"
    assert context["required_items"] == ["user_task", "project_profile"]
    assert context["explanation"][0]["id"] == "user_task"
    assert artifacts["test_summary"]["command"] in ["pytest", "Not selected"]


def test_get_run_returns_plan(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post("/runs", json={"project_id": project["project_id"], "task": "plan", "mode": "Bugfix"}).json()

    response = client.get(f"/runs/{run['run_id']}")

    assert response.status_code == 200
    assert response.json()["plan"][0]["id"] == "scan"


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


def test_model_status_reports_missing_key_without_exposing_environment_value(
    tmp_path: Path,
    monkeypatch,
) -> None:
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.yaml").write_text(
        "\n".join(
            [
                "models:",
                "  provider: openai-compatible",
                "  default_model: demo-model",
                "  api_key_env: MINIAGENT_API_STATUS_TEST_KEY",
                "  base_url: https://provider.example/v1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("MINIAGENT_API_STATUS_TEST_KEY", raising=False)
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    response = client.get("/models/status", params={"project_id": project["project_id"]})

    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is False
    assert data["issues"] == ["missing_environment_variable:MINIAGENT_API_STATUS_TEST_KEY"]
    assert data["api_key_env"] == "MINIAGENT_API_STATUS_TEST_KEY"
    assert "api_key" not in data

    secret = "status-secret-must-not-leak"
    monkeypatch.setenv("MINIAGENT_API_STATUS_TEST_KEY", secret)
    ready_response = client.get("/models/status", params={"project_id": project["project_id"]})

    assert ready_response.json()["configured"] is True
    assert secret not in ready_response.text
