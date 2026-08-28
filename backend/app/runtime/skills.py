from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from app.models.base import Serializable
from app.runtime.config import load_yaml


@dataclass(slots=True)
class SkillCard(Serializable):
    id: str
    name: str
    description: str
    path: str
    modes: list[str] = field(default_factory=list)
    default_tools: list[str] = field(default_factory=list)
    risk: str = "medium"


def load_skill_cards(registry_path: str | Path) -> list[SkillCard]:
    data = load_yaml(registry_path)
    skills = data.get("skills", [])
    if not isinstance(skills, list):
        raise ValueError("skills registry must contain a list field: skills")

    cards: list[SkillCard] = []
    for item in skills:
        if not isinstance(item, dict):
            raise ValueError("each skill entry must be a mapping")
        cards.append(
            SkillCard(
                id=str(item["id"]),
                name=str(item.get("name", item["id"])),
                description=str(item.get("description", "")),
                path=str(item["path"]),
                modes=[str(mode) for mode in item.get("modes", [])],
                default_tools=[str(tool) for tool in item.get("default_tools", [])],
                risk=str(item.get("risk", "medium")),
            )
        )
    return cards

