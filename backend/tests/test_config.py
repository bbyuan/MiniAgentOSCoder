from pathlib import Path

from app.runtime.config import load_yaml


ROOT = Path(__file__).resolve().parents[2]


def test_agent_config_loads() -> None:
    data = load_yaml(ROOT / ".agent" / "config.yaml")

    assert data["agent"]["id"] == "miniagent-coder"
    assert "fs.read" in data["effects"]["allow"]
    assert data["approval"]["require_patch_approval"] is True


def test_skill_registry_loads() -> None:
    data = load_yaml(ROOT / ".agent" / "skills.yaml")

    assert data["skills"][0]["id"] == "bugfix"
    assert data["skills"][0]["path"].endswith("bugfix/SKILL.md")

