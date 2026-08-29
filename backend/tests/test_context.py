import json
from pathlib import Path

from app.models import AgentContract, ContextItem, ContextPack, ContextPackBudget
from app.runtime.planner import build_action_request
from app.context import (
    ContextCandidate,
    build_context_pack,
    build_workspace_index,
    scan_workspace,
    write_project_profile,
)
from app.context.pack_builder import explain_context_items
from app.context.compactor import compact_context_pack


def test_scan_workspace_detects_python_project(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname='demo'\n", encoding="utf-8")
    (tmp_path / "app.py").write_text("def main(): pass\n", encoding="utf-8")

    profile = scan_workspace(tmp_path)

    assert "python" in profile.languages
    assert "pip" in profile.package_managers
    assert "pytest" in profile.test_commands


def test_write_project_profile(tmp_path: Path) -> None:
    profile = scan_workspace(tmp_path)
    path = write_project_profile(profile, tmp_path)

    assert path == tmp_path / ".agent" / "project-profile.json"
    assert json.loads(path.read_text(encoding="utf-8"))["path"] == str(tmp_path.resolve())


def test_workspace_index_extracts_symbols_relations_and_snippets(tmp_path: Path) -> None:
    source = tmp_path / "service.py"
    source.write_text("import json\n\nclass Service:\n    def run(self):\n        return json.dumps({})\n", encoding="utf-8")

    index = build_workspace_index(tmp_path, tmp_path / ".agent" / "index")

    assert index.files[0]["path"] == "service.py"
    assert any(symbol["name"] == "Service" for symbol in index.symbols)
    assert any(relation["target"] == "json" for relation in index.relations)
    assert (tmp_path / ".agent" / "index" / "files.json").exists()
    assert (tmp_path / ".agent" / "index" / "snippets.jsonl").exists()


def test_workspace_index_excludes_generated_agent_and_run_files(tmp_path: Path) -> None:
    (tmp_path / "service.py").write_text("def run(): pass\n", encoding="utf-8")
    (tmp_path / ".agent").mkdir()
    (tmp_path / ".agent" / "memory.py").write_text("def stale(): pass\n", encoding="utf-8")
    (tmp_path / "runs" / "old").mkdir(parents=True)
    (tmp_path / "runs" / "old" / "report.py").write_text("def stale(): pass\n", encoding="utf-8")

    index = build_workspace_index(tmp_path)

    assert [item["path"] for item in index.files] == ["service.py"]


def test_context_pack_selects_required_and_prioritized_items() -> None:
    required = [
        ContextCandidate(
            id="task",
            type="user_task",
            source="user",
            reason="original task",
            content="fix bug",
            priority=1.0,
        )
    ]
    candidates = [
        ContextCandidate(
            id="important",
            type="file_snippet",
            source="src/app.py",
            reason="high relevance",
            content="x" * 20,
            priority=0.9,
        ),
        ContextCandidate(
            id="long-log",
            type="tool_output",
            source="pytest",
            reason="long output",
            content="x" * 400,
            priority=0.1,
        ),
    ]

    pack, items = build_context_pack("run-001", required, candidates, max_tokens=20)
    explanation = explain_context_items(items, pack)

    assert "task" in pack.required_items
    assert "important" in pack.selected_items
    assert "long-log" in pack.compressed_items
    assert any(item["id"] == "task" and item["state"] == "selected" for item in explanation)
    assert any(item["id"] == "long-log" and item["state"] == "compressed" for item in explanation)


def test_compaction_preserves_protected_context_and_compresses_history() -> None:
    required = [
        ContextCandidate("task", "user_task", "user", "original task", "fix bug", 1.0),
    ]
    candidates = [
        ContextCandidate("history", "tool_history", "pytest", "old test output", "x" * 280, 0.2),
    ]
    pack, _ = build_context_pack("run-compact", required, candidates, max_tokens=100)

    result = compact_context_pack(pack)

    assert result.status == "compacted"
    assert result.after_tokens < result.before_tokens
    assert "task" in pack.selected_items
    assert "history" in pack.compressed_items
    assert pack.compaction_count == 1


def test_critical_compaction_requires_confirmation() -> None:
    required = [ContextCandidate("task", "user_task", "user", "task", "fix", 1.0)]
    candidates = [
        ContextCandidate("history", "tool_history", "tool", "large history", "x" * 380, 0.2),
    ]
    pack, _ = build_context_pack("run-critical", required, candidates, max_tokens=100)

    pending = compact_context_pack(pack)
    compacted = compact_context_pack(pack, confirmed=True)

    assert pending.status == "confirmation_required"
    assert pending.confirmation_required is True
    assert compacted.status == "compacted"


def test_planner_receives_selected_and_compressed_context_content() -> None:
    pack = ContextPack(
        run_id="run-planner-context",
        items=[
            ContextItem("task", "user_task", "user", "task", 2, 1.0, "Fix the parser"),
            ContextItem("memory", "memory_project", "user", "project convention", 4, 0.7, "Run parser tests first"),
        ],
        selected_items=["task"],
        compressed_items=["memory"],
        budget_report=ContextPackBudget(100, 6, 94),
    )

    request = build_action_request("Fix the parser", AgentContract("agent"), [], context_pack=pack)
    prompt = request.messages[1].content

    assert "Fix the parser" in prompt
    assert "Run parser tests first" in prompt
    assert "[compressed] memory" in prompt


def test_planner_requests_a_concise_completion_in_the_task_language() -> None:
    request = build_action_request("修复计算器并运行测试", AgentContract("agent"), [])
    system_prompt = request.messages[0].content

    assert "same language as the user's task" in system_prompt
    assert "result, changed files, and verification outcome" in system_prompt
