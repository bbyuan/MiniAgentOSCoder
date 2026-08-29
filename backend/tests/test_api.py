import json
from pathlib import Path
import time

from fastapi.testclient import TestClient

from app.api.store import store
from app.main import create_app
from app.models import Checkpoint, RunPhase
from app.runtime.checkpoint import CheckpointStore
from app.runtime.model_client import QueuedStaticModelClient


def wait_until(predicate, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("Timed out waiting for API run state")


def make_client() -> TestClient:
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


def test_health_endpoint() -> None:
    client = make_client()

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_select_project_directory_returns_selected_path(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.api.projects.choose_local_directory", lambda: tmp_path)
    client = make_client()

    response = client.post("/projects/select-directory")

    assert response.status_code == 200
    assert response.json() == {"path": str(tmp_path), "cancelled": False}


def test_select_project_directory_reports_cancel(monkeypatch) -> None:
    monkeypatch.setattr("app.api.projects.choose_local_directory", lambda: None)
    client = make_client()

    response = client.post("/projects/select-directory")

    assert response.status_code == 200
    assert response.json() == {"path": None, "cancelled": True}


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


def test_cors_allows_tauri_workbench_origin() -> None:
    client = make_client()

    response = client.options(
        "/health",
        headers={
            "Origin": "http://tauri.localhost",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://tauri.localhost"


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
    assert context["required_items"] == ["user_task", "project_profile", "current_plan"]
    assert context["explanation"][0]["id"] == "user_task"
    assert artifacts["test_summary"]["command"] in ["pytest", "Not selected"]


def test_follow_up_run_inherits_bounded_context_and_conversation_lineage(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    root = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "inspect parser", "mode": "Chat"},
    ).json()
    client.post(f"/runs/{root['run_id']}/cancel")

    follow_up = client.post(
        "/runs",
        json={
            "project_id": project["project_id"],
            "task": "now explain the tests",
            "mode": "Chat",
            "parent_run_id": root["run_id"],
        },
    )
    data = follow_up.json()
    context = client.get(f"/runs/{data['run_id']}/context").json()
    conversation = client.get(f"/runs/{data['run_id']}/conversation").json()
    trace = client.get(f"/runs/{data['run_id']}/trace").json()["events"]

    assert follow_up.status_code == 200
    assert data["conversation_id"] == root["run_id"]
    assert data["parent_run_id"] == root["run_id"]
    assert data["turn_index"] == 1
    assert [turn["run_id"] for turn in conversation["turns"]] == [root["run_id"], data["run_id"]]
    assert context["required_items"][-1] == "prior_run_summary"
    handoff = next(item for item in context["explanation"] if item["id"] == "prior_run_summary")
    assert handoff["metadata"]["parent_run_id"] == root["run_id"]
    assert any(event["event"] == "conversation.follow_up.created" for event in trace)


def test_follow_up_rejects_non_terminal_cross_project_and_stale_parent(tmp_path: Path) -> None:
    client = make_client()
    first_root = tmp_path / "first"
    second_root = tmp_path / "second"
    first_root.mkdir()
    second_root.mkdir()
    first = client.post("/projects/open", json={"path": str(first_root)}).json()
    second = client.post("/projects/open", json={"path": str(second_root)}).json()
    root = client.post(
        "/runs",
        json={"project_id": first["project_id"], "task": "root", "mode": "Chat"},
    ).json()

    non_terminal = client.post(
        "/runs",
        json={"project_id": first["project_id"], "task": "too early", "mode": "Chat", "parent_run_id": root["run_id"]},
    )
    client.post(f"/runs/{root['run_id']}/cancel")
    cross_project = client.post(
        "/runs",
        json={"project_id": second["project_id"], "task": "wrong project", "mode": "Chat", "parent_run_id": root["run_id"]},
    )
    child = client.post(
        "/runs",
        json={"project_id": first["project_id"], "task": "child", "mode": "Chat", "parent_run_id": root["run_id"]},
    ).json()
    client.post(f"/runs/{child['run_id']}/cancel")
    stale_parent = client.post(
        "/runs",
        json={"project_id": first["project_id"], "task": "branch", "mode": "Chat", "parent_run_id": root["run_id"]},
    )

    assert non_terminal.status_code == 409
    assert cross_project.status_code == 409
    assert stale_parent.status_code == 409
    assert stale_parent.json()["detail"] == "Parent run is not the latest conversation turn"


def test_get_run_returns_plan(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post("/runs", json={"project_id": project["project_id"], "task": "plan", "mode": "Bugfix"}).json()

    response = client.get(f"/runs/{run['run_id']}")

    assert response.status_code == 200
    assert response.json()["plan"][0]["id"] == "scan"


def test_memory_api_manages_scopes_and_requires_long_term_confirmation(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "remember conventions", "mode": "Bugfix"},
    ).json()
    memory_url = f"/runs/{run['run_id']}/memory"

    initial = client.get(memory_url)
    rejected = client.post(
        memory_url,
        json={"scope": "long_term", "kind": "preference", "content": "Prefer concise reports"},
    )
    created = client.post(
        memory_url,
        json={
            "scope": "long_term",
            "kind": "preference",
            "content": "Prefer concise reports",
            "confirmed": True,
        },
    )
    memory_id = created.json()["entry"]["memory_id"]
    updated = client.put(
        f"{memory_url}/{memory_id}",
        json={
            "kind": "preference",
            "content": "Prefer concise bilingual reports",
            "tags": ["report"],
            "confirmed": True,
        },
    )
    deleted = client.delete(f"{memory_url}/{memory_id}")

    assert initial.status_code == 200
    assert initial.json()["counts"]["short_term"] == 5
    assert rejected.status_code == 409
    assert created.status_code == 201
    assert updated.json()["entry"]["tags"] == ["report"]
    assert deleted.json()["deleted"] == memory_id


def test_memory_api_rejects_secret_content(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "do not leak", "mode": "Bugfix"},
    ).json()

    response = client.post(
        f"/runs/{run['run_id']}/memory",
        json={"scope": "project", "kind": "note", "content": "api_key=never-store-me"},
    )

    assert response.status_code == 422
    assert "never-store-me" not in response.text


def test_project_memory_is_injected_into_the_next_run_context(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    first = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "record convention", "mode": "Bugfix"},
    ).json()
    created = client.post(
        f"/runs/{first['run_id']}/memory",
        json={"scope": "project", "kind": "command", "content": "Run parser tests first"},
    ).json()["entry"]

    second = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "fix parser", "mode": "Bugfix"},
    ).json()
    context = client.get(f"/runs/{second['run_id']}/context").json()

    assert created["memory_id"] in context["selected_items"]
    assert any(item["id"] == created["memory_id"] for item in context["explanation"])


def test_governance_api_updates_pre_run_controls(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "govern tools", "mode": "Bugfix"},
    ).json()
    url = f"/runs/{run['run_id']}/governance"

    initial = client.get(url)
    updated = client.put(
        url,
        json={"sandbox_profile": "strict", "tool_overrides": {"run_test": "approval_required"}},
    )
    invalid = client.put(
        url,
        json={"sandbox_profile": "strict", "tool_overrides": {"unknown": "deny"}},
    )

    assert initial.status_code == 200
    assert initial.json()["capabilities"]["backend"] == "portable-process"
    assert initial.json()["editable"] is True
    assert {tool["name"] for tool in initial.json()["tools"]} == {
        "read_file",
        "search_code",
        "list_files",
        "run_test",
        "run_lint",
        "git_status",
        "git_diff",
        "run_command",
        "apply_patch",
    }
    assert next(tool for tool in initial.json()["tools"] if tool["name"] == "run_command")["effective_policy"] == "approval_required"
    assert updated.json()["settings"]["sandbox_profile"] == "strict"
    assert next(tool for tool in updated.json()["tools"] if tool["name"] == "run_test")["effective_policy"] == "approval_required"
    assert invalid.status_code == 422


def test_governance_api_rebuilds_policy_and_sandbox_history(tmp_path: Path, monkeypatch) -> None:
    (tmp_path / "app.py").write_text("print('ready')\n", encoding="utf-8")
    monkeypatch.setattr(
        "app.api.runs.create_model_client",
        lambda config_path: QueuedStaticModelClient(
            [
                json.dumps({
                    "type": "run_test",
                    "rationale": "smoke",
                    "params": {"command": "python3 -c \"print(123)\""},
                }),
                json.dumps({"type": "finish", "rationale": "done", "params": {"message": "governed"}}),
            ]
        ),
    )
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "run governed test", "mode": "Chat"},
    ).json()

    client.post(f"/runs/{run['run_id']}/start")
    wait_until(lambda: client.get(f"/runs/{run['run_id']}").json()["status"] == "completed")
    governance = client.get(f"/runs/{run['run_id']}/governance").json()
    locked_update = client.put(
        f"/runs/{run['run_id']}/governance",
        json={"sandbox_profile": "strict", "tool_overrides": {}},
    )

    assert governance["editable"] is False
    assert governance["evaluations"][0]["tool"] == "run_test"
    assert governance["evaluations"][0]["outcome"] == "allowed"
    assert governance["executions"][0]["backend"] == "portable-process"
    assert locked_update.status_code == 409


def test_elevated_test_policy_uses_generic_approval_and_resumes(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.runs.create_model_client",
        lambda config_path: QueuedStaticModelClient(
            [
                json.dumps({
                    "type": "run_test",
                    "rationale": "approved smoke test",
                    "params": {"command": "python3 -c \"print('approved')\""},
                }),
                json.dumps({"type": "finish", "rationale": "done", "params": {"message": "approved test ran"}}),
            ]
        ),
    )
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "approve test", "mode": "Chat"},
    ).json()
    client.put(
        f"/runs/{run['run_id']}/governance",
        json={"sandbox_profile": "standard", "tool_overrides": {"run_test": "approval_required"}},
    )

    client.post(f"/runs/{run['run_id']}/start")
    wait_until(lambda: client.get(f"/runs/{run['run_id']}").json()["status"] == "waiting_approval")
    approval = client.get(f"/runs/{run['run_id']}/approval").json()["approval"]
    approved = client.post(
        f"/runs/{run['run_id']}/approve",
        json={"approval_id": approval["approval_id"], "mode": "approve_once"},
    )
    wait_until(lambda: client.get(f"/runs/{run['run_id']}").json()["status"] == "completed")

    assert approval["target"]["tool"] == "run_test"
    assert "python3" in approval["target"]["command"]
    assert approval["target"]["files"] == []
    assert approved.status_code == 200
    assert client.get(f"/runs/{run['run_id']}").json()["final_message"] == "approved test ran"


def test_extensions_api_configures_mode_skills_before_launch(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "fix parser", "mode": "Bugfix"},
    ).json()
    url = f"/runs/{run['run_id']}/extensions"

    initial = client.get(url)
    updated = client.put(
        url,
        json={
            "active_skill_ids": ["bugfix"],
            "enabled_mcp_server_ids": [],
            "enabled_hook_ids": [],
        },
    )
    invalid = client.put(
        url,
        json={
            "active_skill_ids": ["code-review"],
            "enabled_mcp_server_ids": [],
            "enabled_hook_ids": [],
        },
    )

    assert initial.status_code == 200
    assert initial.json()["editable"] is True
    assert initial.json()["settings"]["active_skill_ids"] == ["bugfix", "test-repair"]
    assert all("command" not in server for server in initial.json()["catalog"]["mcp_servers"])
    assert updated.json()["settings"]["active_skill_ids"] == ["bugfix"]
    assert invalid.status_code == 422


def test_extensions_are_activated_in_planner_and_locked_after_launch(tmp_path: Path, monkeypatch) -> None:
    (tmp_path / "app.py").write_text("print('ready')\n", encoding="utf-8")
    monkeypatch.setattr(
        "app.api.runs.create_model_client",
        lambda config_path: QueuedStaticModelClient(
            [
                '{"type":"use_skill","rationale":"load review workflow","params":{"skill_id":"code-review"}}',
                '{"type":"read_file","rationale":"inspect","params":{"path":"app.py"}}',
                '{"type":"finish","rationale":"done","params":{"message":"skill used"}}',
            ]
        ),
    )
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "review code", "mode": "Review"},
    ).json()
    url = f"/runs/{run['run_id']}/extensions"

    client.post(f"/runs/{run['run_id']}/start")
    wait_until(lambda: client.get(f"/runs/{run['run_id']}").json()["status"] == "completed")
    extensions = client.get(url).json()
    locked = client.put(
        url,
        json={"active_skill_ids": [], "enabled_mcp_server_ids": [], "enabled_hook_ids": []},
    )
    trace = client.get(f"/runs/{run['run_id']}/trace").json()["events"]
    model_requests = [event for event in trace if event["event"] == "model.requested"]

    assert extensions["editable"] is False
    assert extensions["settings"]["active_skill_ids"] == ["code-review"]
    assert any(event["event"] == "skill.activated" for event in extensions["evidence"])
    assert model_requests[0]["payload"]["request"]["metadata"]["available_skill_ids"] == ["code-review"]
    assert model_requests[0]["payload"]["request"]["metadata"]["active_skill_ids"] == []
    assert model_requests[1]["payload"]["request"]["metadata"]["active_skill_ids"] == ["code-review"]
    assert "Prioritize correctness" not in json.dumps(model_requests)
    assert locked.status_code == 409


def test_cancel_run(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post("/runs", json={"project_id": project["project_id"], "task": "stop", "mode": "Bugfix"}).json()

    response = client.post(f"/runs/{run['run_id']}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    summary = client.get(f"/runs/{run['run_id']}").json()
    assert summary["termination_reason"] == "cancelled_before_start"
    report = client.get(f"/runs/{run['run_id']}/report").json()
    assert report["available"] is True
    assert "Status: `cancelled`" in report["content"]


def test_steer_run_requires_an_active_worker(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "inspect", "mode": "Chat"},
    ).json()

    response = client.post(f"/runs/{run['run_id']}/steer", json={"message": "Focus on the parser"})

    assert response.status_code == 409
    assert response.json()["detail"] == "Run is not active"


def test_steer_run_queues_guidance_and_records_trace(tmp_path: Path, monkeypatch) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "inspect", "mode": "Chat"},
    ).json()
    captured: list[tuple[str, str]] = []

    def steer(run_id: str, message: str, *, on_queued) -> bool:
        on_queued()
        captured.append((run_id, message))
        return True

    monkeypatch.setattr(store.worker, "steer", steer)

    response = client.post(f"/runs/{run['run_id']}/steer", json={"message": "  Focus on the parser  "})
    trace = client.get(f"/runs/{run['run_id']}/trace").json()["events"]

    assert response.status_code == 202
    assert response.json()["applies_at"] == "next_safe_boundary"
    assert captured == [(run["run_id"], "Focus on the parser")]
    assert trace[-1]["event"] == "user.guidance.queued"
    assert trace[-1]["payload"]["message"] == "Focus on the parser"


def test_events_and_replay_follow_trace_contract(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post("/runs", json={"project_id": project["project_id"], "task": "trace", "mode": "Bugfix"}).json()

    events = client.get(f"/runs/{run['run_id']}/events").json()
    before_replay = client.get(f"/runs/{run['run_id']}/trace").json()["events"]
    replay = client.post(f"/runs/{run['run_id']}/replay").json()
    after_replay = client.get(f"/runs/{run['run_id']}/trace").json()["events"]

    assert events["events"][0]["event"] == "run.created"
    assert replay["replayed"] is True
    assert replay["read_only"] is True
    assert replay["event_count"] == len(before_replay)
    assert replay["events"][0]["event"] == "run.created"
    assert after_replay == before_replay


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


def test_start_run_executes_worker_and_exposes_terminal_summary(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.api.runs.create_model_client",
        lambda config_path: QueuedStaticModelClient(
            ['{"type":"finish","rationale":"done","params":{"message":"API run complete"}}']
        ),
    )
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "finish", "mode": "Chat"},
    ).json()

    start_response = client.post(f"/runs/{run['run_id']}/start")
    wait_until(lambda: client.get(f"/runs/{run['run_id']}").json()["status"] == "completed")
    summary = client.get(f"/runs/{run['run_id']}").json()
    trace = client.get(f"/runs/{run['run_id']}/trace").json()

    assert start_response.status_code == 202
    assert start_response.json()["status"] == "running"
    assert summary["status"] == "completed"
    assert summary["termination_reason"] == "finish"
    assert summary["final_message"] == "API run complete"
    memory = client.get(f"/runs/{run['run_id']}/memory").json()
    report = client.get(f"/runs/{run['run_id']}/report").json()["content"]
    assert memory["counts"]["project"] == 1
    assert "Memory references: `mem-run-" in report
    assert summary["budget"]["model_calls"] == 1
    assert trace["events"][-1]["payload"]["status"] == "completed"
    report = client.get(f"/runs/{run['run_id']}/report").json()
    assert report["available"] is True
    assert report["patch_available"] is False
    assert "API run complete" in report["content"]

    duplicate = client.post(f"/runs/{run['run_id']}/start")
    assert duplicate.status_code == 409


def test_patch_approval_api_resumes_run_and_updates_artifacts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    (tmp_path / "app.py").write_text("old\n", encoding="utf-8")
    patch = """--- a/app.py
+++ b/app.py
@@ -1 +1 @@
-old
+new
"""
    monkeypatch.setattr(
        "app.api.runs.create_model_client",
        lambda config_path: QueuedStaticModelClient([
            json.dumps({"type": "apply_patch", "rationale": "fix app", "params": {"patch": patch}}),
            json.dumps({
                "type": "run_test",
                "rationale": "verify app",
                "params": {"command": "python3 -c \"assert open('app.py').read() == 'new\\n'\""},
            }),
            json.dumps({"type": "finish", "rationale": "done", "params": {"message": "fixed"}}),
        ]),
    )
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "fix app", "mode": "Bugfix"},
    ).json()

    start = client.post(f"/runs/{run['run_id']}/start")
    wait_until(lambda: client.get(f"/runs/{run['run_id']}/approval").json()["approval"] is not None)
    pending = client.get(f"/runs/{run['run_id']}/approval").json()["approval"]

    assert start.status_code == 202
    assert pending["target"]["files"] == ["app.py"]
    assert client.get(f"/runs/{run['run_id']}").json()["waiting_on"] == pending["approval_id"]
    active_rollback = client.post(
        f"/runs/{run['run_id']}/rollback",
        json={"checkpoint_id": "missing"},
    )
    assert active_rollback.status_code == 409
    approved = client.post(
        f"/runs/{run['run_id']}/approve",
        json={"approval_id": pending["approval_id"], "mode": "approve_once"},
    )
    wait_until(lambda: client.get(f"/runs/{run['run_id']}").json()["status"] == "completed")

    artifacts = client.get(f"/runs/{run['run_id']}/artifacts").json()
    events = client.get(f"/runs/{run['run_id']}/events").json()["events"]
    assert approved.status_code == 200
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "new\n"
    assert artifacts["diff_summary"] == {
        "status": "Applied",
        "files": 1,
        "insertions": 1,
        "deletions": 1,
    }
    assert artifacts["test_summary"]["status"] == "Passed"
    report = client.get(f"/runs/{run['run_id']}/report").json()
    assert report["available"] is True
    assert report["patch_available"] is True
    assert report["patch_count"] == 1
    assert "Applied patches: 1" in report["content"]
    assert any(event["event"] == "approval.requested" for event in events)
    assert any(event["event"] == "patch.snapshot.created" for event in events)

    checkpoints = client.get(f"/runs/{run['run_id']}/checkpoints").json()
    recovery_point = next(item for item in checkpoints["checkpoints"] if item["snapshot_available"])
    assert recovery_point["files"] == ["app.py"]
    assert recovery_point["can_rollback"] is True
    rollback = client.post(
        f"/runs/{run['run_id']}/rollback",
        json={"checkpoint_id": recovery_point["checkpoint_id"]},
    )

    assert rollback.status_code == 200
    assert rollback.json()["restored"] == 1
    assert (tmp_path / "app.py").read_text(encoding="utf-8") == "old\n"
    assert client.get(f"/runs/{run['run_id']}").json()["rolled_back_to"] == recovery_point["checkpoint_id"]
    assert client.get(f"/runs/{run['run_id']}/artifacts").json()["diff_summary"]["status"] == "Rolled back"
    rollback_events = client.get(f"/runs/{run['run_id']}/events").json()["events"]
    assert [event["event"] for event in rollback_events][-3:] == [
        "rollback.started",
        "rollback.completed",
        "report.generated",
    ]
    refreshed_report = client.get(f"/runs/{run['run_id']}/report").json()
    assert recovery_point["checkpoint_id"] in refreshed_report["content"]


def test_start_run_rejects_missing_model_configuration(tmp_path: Path) -> None:
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.yaml").write_text(
        "models:\n  provider: openai-compatible\n  default_model: unset\n",
        encoding="utf-8",
    )
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "finish", "mode": "Chat"},
    ).json()

    response = client.post(f"/runs/{run['run_id']}/start")

    assert response.status_code == 409
    assert "model_not_configured" in response.json()["detail"]
    assert client.get(f"/runs/{run['run_id']}").json()["status"] == "planning"


def test_terminal_run_sse_stream_supports_event_cursor(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.runs.create_model_client",
        lambda config_path: QueuedStaticModelClient(
            ['{"type":"finish","rationale":"done","params":{"message":"stream complete"}}']
        ),
    )
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "finish", "mode": "Chat"},
    ).json()
    client.post(f"/runs/{run['run_id']}/start")
    wait_until(lambda: client.get(f"/runs/{run['run_id']}").json()["status"] == "completed")
    trace_events = client.get(f"/runs/{run['run_id']}/trace").json()["events"]

    response = client.get(
        f"/runs/{run['run_id']}/events/stream",
        params={"after": len(trace_events) - 4},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text.count("event: trace") == 4
    assert "run.finished" in response.text
    assert "report.generated" in response.text
    assert "run.transitioned" in response.text


def test_resume_rehydrates_an_interrupted_run_from_checkpoint(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("print('ready')\n", encoding="utf-8")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    created = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "review app", "mode": "Review"},
    ).json()
    run_id = created["run_id"]
    run = store.runs[run_id]
    checkpoint = Checkpoint(
        checkpoint_id="resume-point",
        run_id=run_id,
        step=3,
        status=RunPhase.RUNNING,
        run_state={**run.to_dict(), "current_step": 3},
        context_summary="user_task, current_plan, app.py",
        memory_snapshot={"refs": []},
        trace_offset=2,
    )
    CheckpointStore(tmp_path / "runs").save(checkpoint)
    run.status = RunPhase.FAILED
    store.history.update_run(run)
    store.projects.clear()
    store.runs.clear()
    store.contracts.clear()
    store.contexts.clear()
    store.artifacts.clear()
    store.run_projects.clear()

    response = client.post(f"/runs/{run_id}/resume", json={})
    trace = client.get(f"/runs/{run_id}/trace").json()

    assert response.status_code == 200
    assert response.json()["status"] == "planning"
    assert response.json()["checkpoint_id"] == "resume-point"
    assert response.json()["task"] == "review app"
    assert response.json()["mode"] == "Review"
    assert response.json()["project"]["path"] == str(tmp_path)
    assert store.runs[run_id].current_step == 3
    assert "resume:resume-point" in store.contexts[run_id].required_items
    assert store.history.get_run(run_id)["status"] == "planning"
    assert trace["events"][-1]["event"] == "run.resumed"


def test_resume_rejects_completed_run(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    created = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "done", "mode": "Chat"},
    ).json()
    run = store.runs[created["run_id"]]
    run.status = RunPhase.COMPLETED
    store.history.update_run(run)

    response = client.post(f"/runs/{run.run_id}/resume", json={})

    assert response.status_code == 409


def test_resume_rejects_workspace_restore_without_snapshot(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    created = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "resume safely", "mode": "Chat"},
    ).json()
    run = store.runs[created["run_id"]]
    CheckpointStore(tmp_path / "runs").save(
        Checkpoint(
            checkpoint_id="metadata-only",
            run_id=run.run_id,
            step=1,
            status=RunPhase.RUNNING,
            run_state=run.to_dict(),
            context_summary="task and workspace",
        )
    )
    run.status = RunPhase.FAILED
    store.history.update_run(run)

    response = client.post(
        f"/runs/{run.run_id}/resume",
        json={"checkpoint_id": "metadata-only", "restore_workspace": True},
    )

    assert response.status_code == 409
    assert "restorable snapshot" in response.json()["detail"]


def test_resumed_run_can_start_through_the_normal_worker_path(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.runs.create_model_client",
        lambda config_path: QueuedStaticModelClient(
            ['{"type":"finish","rationale":"done","params":{"message":"resumed successfully"}}']
        ),
    )
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    created = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "continue chat", "mode": "Chat"},
    ).json()
    run_id = created["run_id"]
    run = store.runs[run_id]
    CheckpointStore(tmp_path / "runs").save(
        Checkpoint(
            checkpoint_id="restart-point",
            run_id=run_id,
            step=1,
            status=RunPhase.RUNNING,
            run_state=run.to_dict(),
            context_summary="original task",
        )
    )
    run.status = RunPhase.FAILED
    store.history.update_run(run)
    store.projects.clear()
    store.runs.clear()
    store.contracts.clear()
    store.contexts.clear()
    store.artifacts.clear()
    store.run_projects.clear()

    resumed = client.post(f"/runs/{run_id}/resume", json={})
    started = client.post(f"/runs/{run_id}/start")
    wait_until(lambda: client.get(f"/runs/{run_id}").json()["status"] == "completed")

    assert resumed.status_code == 200
    assert started.status_code == 202
    assert client.get(f"/runs/{run_id}").json()["final_message"] == "resumed successfully"
