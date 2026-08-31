import json
from pathlib import Path

from app.models import AgentContract, ContextItem, ContextPack, ContextPackBudget
from app.runtime.planner import build_action_request
from app.context import (
    ContextCandidate,
    build_context_pack,
    build_workspace_index,
    discover_project_protocol_context,
    discover_project_rules,
    load_workspace_index,
    retrieve_workspace_context,
    scan_workspace,
    set_current_diff_item,
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


def test_scan_workspace_detects_unittest_project(tmp_path: Path) -> None:
    (tmp_path / "calculator.py").write_text("def add(a, b):\n    return a + b\n", encoding="utf-8")
    (tmp_path / "test_calculator.py").write_text(
        "import unittest\n\n"
        "from calculator import add\n\n"
        "class CalculatorTest(unittest.TestCase):\n"
        "    def test_add(self):\n"
        "        self.assertEqual(add(1, 2), 3)\n",
        encoding="utf-8",
    )

    profile = scan_workspace(tmp_path)

    assert "python" in profile.languages
    assert "python3 -m unittest discover -v" in profile.test_commands


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


def test_workspace_index_persists_test_relations(tmp_path: Path) -> None:
    (tmp_path / "service.py").write_text("def run():\n    return True\n", encoding="utf-8")
    (tmp_path / "test_service.py").write_text(
        "from service import run\n\ndef test_run():\n    assert run()\n",
        encoding="utf-8",
    )

    build_workspace_index(tmp_path, tmp_path / ".agent" / "index")
    loaded = load_workspace_index(tmp_path / ".agent" / "index")

    assert any(
        relation["type"] == "test_of"
        and relation["path"] == "test_service.py"
        and relation["target"] == "service.py"
        for relation in loaded.relations
    )


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


def test_project_rules_are_redacted_bounded_and_protected(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text(
        "Run focused tests first.\napi_key=unsafe-value\n" + "x" * 14000,
        encoding="utf-8",
    )

    rules = discover_project_rules(tmp_path)
    pack, _ = build_context_pack("run-rules", rules, [], max_tokens=5000)

    assert len(rules) == 1
    assert rules[0].type == "project_rules"
    assert "unsafe-value" not in rules[0].content
    assert "[REDACTED_SECRET]" in rules[0].content
    assert rules[0].metadata["bounded"] is True
    assert rules[0].id in pack.required_items


def test_project_protocol_context_includes_openspec_and_skills(tmp_path: Path) -> None:
    skill_dir = tmp_path / ".agent" / "skills" / "reviewer"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "Review memory changes before editing.\napi_key=unsafe-value\n",
        encoding="utf-8",
    )
    change_dir = tmp_path / "openspec" / "changes" / "add-memory"
    change_dir.mkdir(parents=True)
    (change_dir / "proposal.md").write_text("Add project memory governance.\n", encoding="utf-8")
    (change_dir / "tasks.md").write_text("- [ ] Persist scoped memory\n", encoding="utf-8")
    spec_dir = tmp_path / "openspec" / "specs" / "memory"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec.md").write_text("Memory SHALL be scoped per workspace.\n", encoding="utf-8")

    candidates = discover_project_protocol_context(tmp_path, "实现 memory 管理", max_items=10)

    sources = {candidate.source for candidate in candidates}
    assert ".agent/skills/reviewer/SKILL.md" in sources
    assert "openspec/changes/add-memory/proposal.md" in sources
    assert "openspec/changes/add-memory/tasks.md" in sources
    assert "openspec/specs/memory/spec.md" in sources
    assert all(candidate.type == "project_protocol" for candidate in candidates)
    assert all(candidate.metadata["trusted"] is True for candidate in candidates)
    assert "unsafe-value" not in "\n".join(candidate.content for candidate in candidates)
    assert any(candidate.metadata["matched_terms"] for candidate in candidates)


def test_project_protocol_context_bounds_long_documents(tmp_path: Path) -> None:
    changes_dir = tmp_path / "openspec" / "changes" / "large-change"
    changes_dir.mkdir(parents=True)
    (changes_dir / "proposal.md").write_text("Header\n" + "x" * 5000, encoding="utf-8")

    [candidate] = discover_project_protocol_context(tmp_path, max_item_chars=800)

    assert candidate.metadata["bounded"] is True
    assert len(candidate.content) < 1000
    assert "...[openspec_change bounded]..." in candidate.content


def test_task_aware_retrieval_ranks_source_and_related_test(tmp_path: Path) -> None:
    (tmp_path / "calculator.py").write_text(
        "class Calculator:\n"
        "    def add(self, left, right):\n"
        "        return left - right\n",
        encoding="utf-8",
    )
    (tmp_path / "test_calculator.py").write_text(
        "from calculator import Calculator\n\n"
        "def test_add():\n"
        "    assert Calculator().add(2, 3) == 5\n",
        encoding="utf-8",
    )
    (tmp_path / "unrelated.py").write_text("def heartbeat():\n    return 'ok'\n", encoding="utf-8")
    build_workspace_index(tmp_path, tmp_path / ".agent" / "index")

    candidates = retrieve_workspace_context(tmp_path, "修复 Calculator.add 并运行测试", {"entrypoints": []})

    sources = [candidate.source for candidate in candidates]
    assert sources[0] == "calculator.py"
    assert "test_calculator.py" in sources
    assert "unrelated.py" not in sources
    assert candidates[0].metadata["matched_terms"]
    assert candidates[0].metadata["start_line"] == 1


def test_task_aware_retrieval_limits_snippets_per_file(tmp_path: Path) -> None:
    repeated = "\n".join(f"def parser_{index}(): return 'parser'" for index in range(100))
    (tmp_path / "parser.py").write_text(repeated, encoding="utf-8")
    (tmp_path / "test_parser.py").write_text("def test_parser(): pass\n", encoding="utf-8")
    build_workspace_index(tmp_path, tmp_path / ".agent" / "index")

    candidates = retrieve_workspace_context(tmp_path, "repair parser", max_snippets=10, max_per_file=2)

    assert sum(candidate.source == "parser.py" for candidate in candidates) == 2


def test_task_aware_retrieval_rebuilds_a_corrupt_index(tmp_path: Path) -> None:
    (tmp_path / "app.py").write_text("def render(): return 'ready'\n", encoding="utf-8")
    index_dir = tmp_path / ".agent" / "index"
    index_dir.mkdir(parents=True)
    (index_dir / "files.json").write_text("not-json", encoding="utf-8")

    candidates = retrieve_workspace_context(
        tmp_path,
        "explain behavior",
        {"entrypoints": ["app.py"]},
    )

    assert candidates[0].source == "app.py"
    assert load_workspace_index(index_dir).files[0]["path"] == "app.py"


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


def test_current_diff_replaces_previous_diff_and_survives_compaction() -> None:
    required = [ContextCandidate("task", "user_task", "user", "task", "fix", 1.0)]
    candidates = [ContextCandidate("history", "tool_history", "tool", "history", "x" * 380, 0.1)]
    pack, _ = build_context_pack("run-diff", required, candidates, max_tokens=150)

    set_current_diff_item(pack, step=1, content="--- a/app.py\n+++ b/app.py\n-old\n+new\n")
    latest = set_current_diff_item(pack, step=2, content="--- a/app.py\n+++ b/app.py\n-new\n+fixed\n")
    compact_context_pack(pack, confirmed=True)

    diff_items = [item for item in pack.items if item.type == "current_diff"]
    assert diff_items == [latest]
    assert latest.id in pack.selected_items
    assert "+fixed" in latest.content


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
