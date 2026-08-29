from pathlib import Path

from app.models import ActionObservation, ActiveSkill
from app.runtime.capability_menu import build_capability_menu, capability_phase
from app.tools import create_builtin_tool_registry


def _tools(tmp_path: Path):
    return [descriptor for descriptor, _, _ in create_builtin_tool_registry(tmp_path)]


def _observation(action_type: str, *, ok: bool = True) -> ActionObservation:
    return ActionObservation(step=1, action_type=action_type, ok=ok)


def test_capability_menu_starts_with_read_only_inspection(tmp_path: Path) -> None:
    menu = build_capability_menu(
        _tools(tmp_path),
        mode="Feature",
        allowed_effects=["fs.read", "fs.write", "shell.exec", "test.run"],
        observations=[],
    )

    assert menu.phase == "inspect"
    assert [tool.name for tool in menu.tools] == ["read_file", "search_code", "list_files", "git_status", "git_diff"]
    assert "apply_patch" in menu.hidden_tools
    assert "run_command" in menu.hidden_tools


def test_capability_menu_moves_from_work_to_verify_and_repair(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    allowed = ["fs.read", "fs.write", "shell.exec", "test.run"]
    work = build_capability_menu(
        tools,
        mode="Bugfix",
        allowed_effects=allowed,
        observations=[_observation("read_file")],
    )
    verify = build_capability_menu(
        tools,
        mode="Bugfix",
        allowed_effects=allowed,
        observations=[_observation("read_file"), _observation("apply_patch")],
    )
    repair = build_capability_menu(
        tools,
        mode="Bugfix",
        allowed_effects=allowed,
        observations=[_observation("apply_patch"), _observation("run_test", ok=False)],
    )

    assert work.phase == "work" and "apply_patch" in [tool.name for tool in work.tools]
    assert verify.phase == "verify" and "apply_patch" not in [tool.name for tool in verify.tools]
    assert repair.phase == "repair" and "apply_patch" in [tool.name for tool in repair.tools]
    assert capability_phase([_observation("apply_patch"), _observation("run_test")]) == "work"


def test_read_only_modes_never_disclose_effectful_tools(tmp_path: Path) -> None:
    menu = build_capability_menu(
        _tools(tmp_path),
        mode="Review",
        allowed_effects=["fs.read", "fs.write", "shell.exec", "test.run"],
        observations=[_observation("read_file")],
    )

    assert all(tool.effect == "fs.read" for tool in menu.tools)


def test_active_skill_default_tools_are_prioritized(tmp_path: Path) -> None:
    skill = ActiveSkill(
        id="test",
        name="Test",
        description="Test first",
        path="SKILL.md",
        content="",
        digest="digest",
        default_tools=["run_test", "read_file"],
    )
    menu = build_capability_menu(
        _tools(tmp_path),
        mode="Bugfix",
        allowed_effects=["fs.read", "fs.write", "shell.exec", "test.run"],
        observations=[_observation("read_file")],
        active_skills=[skill],
    )

    assert [tool.name for tool in menu.tools[:2]] == ["run_test", "read_file"]
