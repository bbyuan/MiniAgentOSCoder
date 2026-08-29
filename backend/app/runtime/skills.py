from __future__ import annotations

from hashlib import sha256
from pathlib import Path

from app.models import ActiveSkill, SkillManifest
from app.runtime.config import load_yaml


def load_skill_cards(registry_path: str | Path, *, mode: str | None = None) -> list[SkillManifest]:
    registry = Path(registry_path).resolve()
    root = registry.parent.parent
    data = load_yaml(registry_path)
    skills = data.get("skills", [])
    if not isinstance(skills, list):
        raise ValueError("skills registry must contain a list field: skills")

    cards: list[SkillManifest] = []
    seen: set[str] = set()
    for item in skills:
        if not isinstance(item, dict):
            raise ValueError("each skill entry must be a mapping")
        skill_id = str(item["id"])
        path = str(item["path"])
        errors: list[str] = []
        if skill_id in seen:
            errors.append(f"Duplicate skill id: {skill_id}")
        seen.add(skill_id)
        try:
            resolved = (root / path).resolve()
            if not resolved.is_relative_to(root):
                errors.append("Skill path escapes the registry root")
            elif not resolved.is_file():
                errors.append("SKILL.md file does not exist")
        except OSError:
            errors.append("Skill path cannot be resolved")
        modes = [str(value) for value in item.get("modes", [])]
        cards.append(
            SkillManifest(
                id=skill_id,
                name=str(item.get("name", skill_id)),
                description=str(item.get("description", "")),
                path=path,
                modes=modes,
                default_tools=[str(tool) for tool in item.get("default_tools", [])],
                risk=str(item.get("risk", "medium")),
                recommended=mode is not None and (not modes or mode in modes),
                valid=not errors,
                errors=errors,
            )
        )
    return cards


def activate_skills(
    cards: list[SkillManifest],
    active_ids: list[str],
    registry_path: str | Path,
    *,
    max_chars: int = 12000,
) -> list[ActiveSkill]:
    registry = Path(registry_path).resolve()
    root = registry.parent.parent
    by_id = {card.id: card for card in cards}
    active: list[ActiveSkill] = []
    for skill_id in active_ids:
        card = by_id.get(skill_id)
        if card is None or not card.valid:
            raise ValueError(f"Skill is not available: {skill_id}")
        resolved = (root / card.path).resolve()
        if not resolved.is_relative_to(root) or not resolved.is_file():
            raise ValueError(f"Skill path is invalid: {skill_id}")
        content = resolved.read_text(encoding="utf-8")
        if len(content) > max_chars:
            content = f"{content[:max_chars]}\n...[skill content truncated]"
        active.append(
            ActiveSkill(
                id=card.id,
                name=card.name,
                description=card.description,
                path=card.path,
                content=content,
                digest=sha256(content.encode("utf-8")).hexdigest(),
                default_tools=list(card.default_tools),
            )
        )
    return active
