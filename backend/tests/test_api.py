import json
from pathlib import Path
import time

from fastapi.testclient import TestClient

from app.api.store import store
from app.main import create_app
from app.models import Checkpoint, CompletionAssessment, CompletionCheck, RunLoopResult, RunPhase
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
    store.admissions.clear()
    store.model_routes.clear()
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


def test_cors_allows_vite_fallback_local_port() -> None:
    client = make_client()

    response = client.options(
        "/health",
        headers={
            "Origin": "http://127.0.0.1:5176",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5176"


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


def test_project_files_api_lists_readable_workspace_files(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("def main():\n    return 42\n", encoding="utf-8")
    (tmp_path / "README.md").write_text("# Demo\n", encoding="utf-8")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("hidden", encoding="utf-8")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    response = client.get(f"/projects/{project['project_id']}/files")

    assert response.status_code == 200
    paths = [item["path"] for item in response.json()["items"]]
    assert "README.md" in paths
    assert "src/app.py" in paths
    assert ".git/config" not in paths
    assert ".agent/project-profile.json" not in paths


def test_project_file_content_api_reads_text_and_blocks_escape(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("print('hello')\n", encoding="utf-8")
    outside = tmp_path.parent / "outside.txt"
    outside.write_text("secret", encoding="utf-8")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    content = client.get(f"/projects/{project['project_id']}/files/content", params={"path": "src/app.py"})
    escaped = client.get(f"/projects/{project['project_id']}/files/content", params={"path": "../outside.txt"})

    assert content.status_code == 200
    assert content.json()["available"] is True
    assert content.json()["content"] == "print('hello')\n"
    assert escaped.status_code == 400


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
    assert run["admission"]["can_start"] is True
    assert run["admission"]["basis"] in {"heuristic", "hybrid", "history"}
    assert trace["events"][0]["event"] == "run.created"
    assert context["required_items"] == ["user_task", "project_profile", "current_plan"]
    assert context["explanation"][0]["id"] == "user_task"
    assert artifacts["test_summary"]["command"] in ["pytest", "Not selected"]
    assert artifacts["diff_preview"] == {"available": False, "content": "", "truncated": False}
    assert set(artifacts["change_review"]) == {"status", "decided_at", "checkpoint_id", "reason"}
    admission = client.get(f"/runs/{run['run_id']}/admission").json()
    assert admission["run_id"] == run["run_id"]
    assert set(admission["resources"]) == {
        "model_calls",
        "tool_calls",
        "input_tokens",
        "output_tokens",
        "wall_time_seconds",
    }
    assert any(event["event"] == "run.admission.assessed" for event in trace["events"])
    assert run["model_route"]["strategy"] == "single"
    assert run["model_route"]["can_start"] is True


def test_create_project_skill_mcp_and_hook_extension(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname='demo'\n", encoding="utf-8")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "fix bug", "mode": "Bugfix"},
    ).json()

    skill_response = client.post(
        f"/runs/{run['run_id']}/extensions/skills",
        json={
            "id": "project_rule",
            "name": "Project Rule",
            "description": "Follow project conventions",
            "content": "Always inspect relevant tests before editing and summarize the validation command.",
        },
    )
    mcp_response = client.post(
        f"/runs/{run['run_id']}/extensions/mcp-servers",
        json={
            "id": "local_tools",
            "name": "Local Tools",
            "command": ["python", "-m", "demo_mcp"],
            "env_allow": ["DEMO_TOKEN"],
        },
    )
    hook_response = client.post(
        f"/runs/{run['run_id']}/extensions/hooks",
        json={
            "id": "verify_after_run",
            "name": "Verify after run",
            "event": "run.after",
            "command": ["python", "-m", "pytest"],
            "failure_policy": "warn",
        },
    )

    assert skill_response.status_code == 200
    assert mcp_response.status_code == 200
    assert hook_response.status_code == 200
    payload = hook_response.json()
    skill_ids = {skill["id"] for skill in payload["catalog"]["skills"]}
    server_ids = {server["id"] for server in payload["catalog"]["mcp_servers"]}
    hook_ids = {hook["id"] for hook in payload["catalog"]["hooks"]}
    assert {"bugfix", "project_rule"}.issubset(skill_ids)
    assert "local_tools" in server_ids
    assert "verify_after_run" in hook_ids
    assert "project_rule" in payload["settings"]["active_skill_ids"]
    assert "local_tools" in payload["settings"]["enabled_mcp_server_ids"]
    assert "verify_after_run" in payload["settings"]["enabled_hook_ids"]
    assert (tmp_path / ".agent" / "skills" / "project_rule" / "SKILL.md").exists()
    assert "project_rule" in (tmp_path / ".agent" / "skills.yaml").read_text(encoding="utf-8")
    assert "local_tools" in (tmp_path / ".agent" / "mcp.yaml").read_text(encoding="utf-8")
    assert "verify_after_run" in (tmp_path / ".agent" / "hooks.yaml").read_text(encoding="utf-8")
    assert "root" not in json.dumps(payload["catalog"]["skills"])


def test_run_exposes_governed_model_route_plan(tmp_path: Path, monkeypatch) -> None:
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.yaml").write_text(
        """agent:
  id: routed-agent
runtime:
  max_steps: 10
models:
  provider: openai-compatible
  default_model: primary-model
  api_key_env: ROUTE_PRIMARY_KEY
  base_url: https://provider.example/v1
  routing:
    enabled: true
    default_profile: default
    phase_routes:
      inspect: economy
      verify: economy
    fallback_profiles: [default]
  profiles:
    economy:
      model: economy-model
      api_key_env: ROUTE_ECONOMY_KEY
      context_window: 64000
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("ROUTE_PRIMARY_KEY", "primary-secret")
    monkeypatch.setenv("ROUTE_ECONOMY_KEY", "economy-secret")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    response = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "inspect routing", "mode": "Bugfix"},
    )
    run = response.json()
    route = client.get(f"/runs/{run['run_id']}/model-route").json()
    trace = client.get(f"/runs/{run['run_id']}/trace").json()["events"]

    assert response.status_code == 200
    assert route["enabled"] is True
    assert route["strategy"] == "policy"
    assert route["can_start"] is True
    assert route["routes"]["inspect"]["profile_id"] == "economy"
    assert route["routes"]["work"]["profile_id"] == "default"
    assert route["routes"]["repair"]["model"] == "primary-model"
    assert any(event["event"] == "model.route.planned" for event in trace)
    assert "primary-secret" not in json.dumps(route)
    assert "economy-secret" not in json.dumps(route)


def test_model_config_endpoint_exposes_safe_profile_snapshot(tmp_path: Path, monkeypatch) -> None:
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.yaml").write_text(
        """models:
  provider: openai-compatible
  default_model: primary-model
  api_key_env: ROUTE_PRIMARY_KEY
  base_url: https://provider.example/v1
  routing:
    enabled: true
    default_profile: default
    phase_routes:
      inspect: economy
    fallback_profiles: [default]
  profiles:
    economy:
      model: economy-model
      api_key_env: ROUTE_ECONOMY_KEY
      context_window: 64000
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("ROUTE_PRIMARY_KEY", "primary-secret")
    monkeypatch.setenv("ROUTE_ECONOMY_KEY", "economy-secret")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    response = client.get(f"/models/config?project_id={project['project_id']}")
    snapshot = response.json()

    assert response.status_code == 200
    assert snapshot["source"] == "project"
    assert snapshot["routing"]["enabled"] is True
    assert snapshot["routing"]["phase_routes"] == {"inspect": "economy"}
    assert {profile["profile_id"] for profile in snapshot["profiles"]} == {"default", "economy"}
    assert "primary-secret" not in json.dumps(snapshot)
    assert "economy-secret" not in json.dumps(snapshot)


def test_project_agent_pack_manifest_is_non_sensitive(tmp_path: Path, monkeypatch) -> None:
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.yaml").write_text(
        """agent:
  id: pack-agent
  name: Pack Agent
  mode: orchestrator
  roles: [Planner, Tester]
runtime:
  max_steps: 8
  max_model_calls: 9
  max_tool_calls: 10
effects:
  allow: [fs.read, test.run]
  deny: [net.public]
models:
  default_model: pack-model
  api_key_env: PACK_MODEL_KEY
  routing:
    enabled: true
    default_profile: default
    phase_routes:
      verify: default
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("PACK_MODEL_KEY", "pack-secret")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    response = client.get(f"/projects/{project['project_id']}/agent-pack?mode=Bugfix")
    manifest = response.json()

    assert response.status_code == 200
    assert manifest["manifest_version"] == "agentpack.v1"
    assert manifest["agent"]["id"] == "pack-agent"
    assert manifest["contract"]["program"]["mode"] == "Bugfix"
    assert manifest["contract"]["cost_envelope"]["max_steps"] == 8
    assert manifest["models"]["routing_enabled"] is True
    assert manifest["models"]["phase_routes"] == {"verify": "default"}
    assert manifest["provenance"]["config_source"] == "project"
    assert manifest["digest"]
    assert "pack-secret" not in json.dumps(manifest)


def test_project_agent_pack_versions_are_persisted_and_listed(tmp_path: Path, monkeypatch) -> None:
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.yaml").write_text(
        """agent:
  id: versioned-agent
runtime:
  max_steps: 6
models:
  default_model: version-model
  api_key_env: VERSION_MODEL_KEY
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("VERSION_MODEL_KEY", "version-secret")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    create_response = client.post(f"/projects/{project['project_id']}/agent-pack/versions?mode=Spec")
    list_response = client.get(f"/projects/{project['project_id']}/agent-pack/versions")
    version = create_response.json()["version"]
    versions = list_response.json()["versions"]

    assert create_response.status_code == 201
    assert list_response.status_code == 200
    assert version["version_id"]
    assert version["mode"] == "Spec"
    assert version["path"].startswith(".agent/agentpacks/versions/")
    assert (tmp_path / version["path"]).is_file()
    assert versions[0]["version_id"] == version["version_id"]
    assert "version-secret" not in json.dumps(version)
    assert "version-secret" not in json.dumps(versions)


def test_project_agent_pack_drift_compares_against_latest_version(tmp_path: Path, monkeypatch) -> None:
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    config_path = agent_dir / "config.yaml"
    config_path.write_text(
        """agent:
  id: drift-agent
runtime:
  max_steps: 6
models:
  default_model: drift-model
  api_key_env: DRIFT_MODEL_KEY
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("DRIFT_MODEL_KEY", "drift-secret")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    first_drift_response = client.get(f"/projects/{project['project_id']}/agent-pack/drift?mode=Spec")
    assert first_drift_response.status_code == 200
    first_drift = first_drift_response.json()
    assert first_drift["has_versions"] is False
    assert first_drift["drift"] is False
    assert first_drift["recommendation"] == "create_first_version"

    client.post(f"/projects/{project['project_id']}/agent-pack/versions?mode=Spec")
    stable_drift = client.get(f"/projects/{project['project_id']}/agent-pack/drift?mode=Spec").json()
    assert stable_drift["has_versions"] is True
    assert stable_drift["drift"] is False
    assert stable_drift["recommendation"] == "up_to_date"
    assert stable_drift["latest_version"]["version_id"]

    config_path.write_text(
        """agent:
  id: drift-agent
runtime:
  max_steps: 12
models:
  default_model: drift-model-v2
  api_key_env: DRIFT_MODEL_KEY
""",
        encoding="utf-8",
    )
    changed_drift_response = client.get(f"/projects/{project['project_id']}/agent-pack/drift?mode=Spec")
    changed_drift = changed_drift_response.json()

    assert changed_drift_response.status_code == 200
    assert changed_drift["drift"] is True
    assert changed_drift["recommendation"] == "save_version"
    assert {"contract", "models"}.issubset(set(changed_drift["changed_sections"]))
    assert "drift-secret" not in json.dumps(changed_drift)


def test_project_protocols_detect_development_guides_without_returning_contents(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text("secret project rule", encoding="utf-8")
    skill_dir = tmp_path / ".agent" / "skills" / "reviewer"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("private skill instructions", encoding="utf-8")
    spec_dir = tmp_path / "openspec" / "specs" / "context"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec.md").write_text("accepted context spec", encoding="utf-8")
    change_dir = tmp_path / "openspec" / "changes" / "add-memory"
    change_dir.mkdir(parents=True)
    (change_dir / "proposal.md").write_text("draft memory proposal", encoding="utf-8")
    (change_dir / "tasks.md").write_text("- [ ] task", encoding="utf-8")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()

    response = client.get(f"/projects/{project['project_id']}/protocols")
    payload = response.json()
    text = json.dumps(payload)

    assert response.status_code == 200
    assert payload["summary"]["agent_docs"] == 1
    assert payload["summary"]["skills"] == 1
    assert payload["summary"]["openspec_specs"] == 1
    assert payload["summary"]["openspec_changes"] == 1
    assert payload["summary"]["total"] == 4
    assert payload["recommendations"] == []
    assert {item["path"] for item in payload["items"]} == {
        "AGENTS.md",
        ".agent/skills/reviewer/SKILL.md",
        "openspec/specs/context/spec.md",
        "openspec/changes/add-memory/proposal.md",
    }
    assert "secret project rule" not in text
    assert "private skill instructions" not in text


def test_model_route_blocks_launch_when_context_fits_no_profile(tmp_path: Path, monkeypatch) -> None:
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.yaml").write_text(
        """agent:
  id: blocked-route-agent
runtime:
  max_steps: 10
models:
  default_model: tiny-model
  api_key_env: TINY_MODEL_KEY
  context_window: 1
  routing:
    enabled: true
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("TINY_MODEL_KEY", "tiny-secret")
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "inspect routing", "mode": "Chat"},
    ).json()

    def unexpected_routed_client(config_path, route_plan):
        raise AssertionError("routed client must not be created for a blocked route")

    monkeypatch.setattr("app.api.runs.create_routed_model_client", unexpected_routed_client)

    response = client.post(f"/runs/{run['run_id']}/start")

    assert run["model_route"]["can_start"] is False
    assert run["admission"]["can_start"] is False
    assert response.status_code == 409
    assert "model_route" in response.json()["detail"]


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


def test_run_evidence_summarizes_runtime_without_content(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "inspect secret code", "mode": "Bugfix"},
    ).json()

    from app.runtime.tracer import TraceWriter

    writer = TraceWriter(tmp_path / "runs")
    writer.event(run["run_id"], "model.requested", {"request": {"model": "demo-model", "messages": [{"content": "secret source"}]}})
    writer.event(run["run_id"], "model.responded", {"response": {"model": "demo-model", "content": "private model content"}})
    writer.event(
        run["run_id"],
        "tool.executed",
        {"action": {"type": "read_file", "params": {"path": "secret.py"}}, "result": {"output": "private code content"}},
    )
    writer.event(run["run_id"], "policy.evaluated", {"evaluation": {"outcome": "allowed"}})
    writer.event(run["run_id"], "approval.requested", {"approval": {"reason": "edit"}})
    writer.event(run["run_id"], "approval.resolved", {"decision": "approve_once"})
    store.run_results[run["run_id"]] = RunLoopResult(
        run_id=run["run_id"],
        status=RunPhase.COMPLETED,
        termination_reason="finish",
        completion=CompletionAssessment(
            verdict="passed",
            mode="Bugfix",
            checks=[CompletionCheck(id="final_message", passed=True, evidence="summary")],
        ),
    )

    response = client.get(f"/runs/{run['run_id']}/evidence")

    assert response.status_code == 200
    payload = response.json()
    text = json.dumps(payload)
    assert payload["run_id"] == run["run_id"]
    assert payload["privacy"]["content_collected"] is False
    assert payload["ready"] >= 4
    assert {item["id"] for item in payload["items"]} == {
        "context",
        "model",
        "tools",
        "governance",
        "extensions",
        "tests",
        "completion",
    }
    assert next(item for item in payload["items"] if item["id"] == "model")["state"] == "ready"
    assert next(item for item in payload["items"] if item["id"] == "governance")["state"] == "ready"
    assert any(detail["value"] == "demo-model" for detail in next(item for item in payload["items"] if item["id"] == "model")["details"])
    assert any(detail["value"] == "read_file" for detail in next(item for item in payload["items"] if item["id"] == "tools")["details"])
    assert any(
        detail["value"] == "final_message: passed"
        for detail in next(item for item in payload["items"] if item["id"] == "completion")["details"]
    )
    assert "secret source" not in text
    assert "private code content" not in text
    assert "private model content" not in text


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
    cross_mode = client.put(
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
    assert initial.json()["summary"]["skills_active"] == 2
    assert initial.json()["summary"]["available_total"] >= initial.json()["summary"]["enabled_total"]
    assert initial.json()["summary"]["has_runtime_activation"] is False
    assert all("command" not in server for server in initial.json()["catalog"]["mcp_servers"])
    skill_compatibility = {
        skill["id"]: skill["compatible"]
        for skill in initial.json()["catalog"]["skills"]
    }
    assert skill_compatibility["bugfix"] is True
    assert skill_compatibility["code-review"] is False
    assert updated.json()["settings"]["active_skill_ids"] == ["bugfix"]
    assert cross_mode.status_code == 200
    assert cross_mode.json()["settings"]["active_skill_ids"] == ["code-review"]


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
    assert extensions["summary"]["runtime_events"] >= 1
    assert extensions["summary"]["has_runtime_activation"] is True
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


def test_start_run_is_blocked_by_admission_before_model_creation(
    tmp_path: Path,
    monkeypatch,
) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    run = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "inspect context", "mode": "Chat"},
    ).json()
    store.contracts[run["run_id"]].cost_envelope.max_input_tokens = 1

    def unexpected_model_creation(config_path):
        raise AssertionError("model client must not be created for a blocked run")

    monkeypatch.setattr("app.api.runs.create_model_client", unexpected_model_creation)

    admission = client.get(f"/runs/{run['run_id']}/admission").json()
    response = client.post(f"/runs/{run['run_id']}/start")

    assert admission["can_start"] is False
    assert admission["decision"] == "blocked"
    assert response.status_code == 409
    assert "context_fit" in response.json()["detail"]


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
    assert artifacts["change_review"]["status"] == "pending"
    assert artifacts["test_summary"]["status"] == "Passed"
    report = client.get(f"/runs/{run['run_id']}/report").json()
    assert report["available"] is True
    assert report["patch_available"] is True
    assert report["patch_count"] == 1
    assert "Applied patches: 1" in report["content"]
    assert any(event["event"] == "approval.requested" for event in events)
    assert any(event["event"] == "patch.snapshot.created" for event in events)
    accepted = client.post(f"/runs/{run['run_id']}/changes/accept", json={"reason": "looks good"})
    accepted_artifacts = client.get(f"/runs/{run['run_id']}/artifacts").json()
    accepted_history = client.get(f"/history/runs/{run['run_id']}").json()["run"]

    assert accepted.status_code == 200
    assert accepted.json()["change_review"]["status"] == "accepted"
    assert accepted.json()["change_review"]["reason"] == "looks good"
    assert accepted_artifacts["change_review"]["status"] == "accepted"
    assert accepted_history["change_review"]["status"] == "accepted"

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
    rolled_back_artifacts = client.get(f"/runs/{run['run_id']}/artifacts").json()
    assert rolled_back_artifacts["diff_summary"]["status"] == "Rolled back"
    assert rolled_back_artifacts["change_review"]["status"] == "reverted"
    assert rolled_back_artifacts["change_review"]["checkpoint_id"] == recovery_point["checkpoint_id"]
    assert client.get(f"/history/runs/{run['run_id']}").json()["run"]["change_review"]["status"] == "reverted"
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


def test_history_run_can_be_deleted_after_terminal_state(tmp_path: Path) -> None:
    client = make_client()
    project = client.post("/projects/open", json={"path": str(tmp_path)}).json()
    created = client.post(
        "/runs",
        json={"project_id": project["project_id"], "task": "temporary history", "mode": "Chat"},
    ).json()
    run = store.runs[created["run_id"]]
    run_dir = tmp_path / "runs" / run.run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "report.md").write_text("# temporary\n", encoding="utf-8")

    active_delete = client.delete(f"/history/runs/{run.run_id}")
    run.status = RunPhase.CANCELLED
    store.history.update_run(run)
    deleted = client.delete(f"/history/runs/{run.run_id}")
    missing = client.get(f"/history/runs/{run.run_id}")
    missing_runtime = client.get(f"/runs/{run.run_id}")
    missing_artifacts = client.get(f"/runs/{run.run_id}/artifacts")

    assert active_delete.status_code == 409
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert missing.status_code == 404
    assert missing_runtime.status_code == 404
    assert missing_artifacts.status_code == 404
    assert not run_dir.exists()


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
