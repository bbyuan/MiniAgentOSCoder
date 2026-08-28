import json
from pathlib import Path

from app.context import (
    ContextCandidate,
    build_context_pack,
    build_workspace_index,
    scan_workspace,
    write_project_profile,
)
from app.context.pack_builder import explain_context_items


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
