from __future__ import annotations

from pathlib import Path
from typing import Any

from app.models import GovernanceSettings, SandboxProfile

try:
    import yaml
except ModuleNotFoundError:  # pragma: no cover - exercised when dependencies are absent.
    yaml = None


def load_yaml(path: str | Path) -> dict[str, Any]:
    config_path = Path(path)
    text = config_path.read_text(encoding="utf-8")
    if yaml is not None:
        data = yaml.safe_load(text) or {}
        if not isinstance(data, dict):
            raise ValueError(f"Expected mapping in {config_path}")
        return data
    return _parse_simple_yaml(text)


def load_governance_settings(path: str | Path) -> GovernanceSettings:
    config = load_yaml(path)
    sandbox = config.get("sandbox", {})
    if not isinstance(sandbox, dict):
        raise ValueError("sandbox configuration must be a mapping")
    profile = SandboxProfile(str(sandbox.get("profile", SandboxProfile.STANDARD.value)))
    return GovernanceSettings(sandbox_profile=profile)


def _parse_simple_yaml(text: str) -> dict[str, Any]:
    """Small fallback parser for the project's simple YAML subset."""
    lines = [
        (len(line) - len(line.lstrip(" ")), line.strip())
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    data, _ = _parse_block(lines, 0, 0)
    if not isinstance(data, dict):
        raise ValueError("Expected root YAML mapping")
    return data


def _parse_block(lines: list[tuple[int, str]], index: int, indent: int) -> tuple[Any, int]:
    if index >= len(lines):
        return {}, index

    if lines[index][0] < indent:
        return {}, index

    if lines[index][1].startswith("- "):
        result: list[Any] = []
        while index < len(lines):
            current_indent, line = lines[index]
            if current_indent != indent or not line.startswith("- "):
                break

            item_text = line[2:].strip()
            if not item_text:
                child, index = _parse_block(lines, index + 1, indent + 2)
                result.append(child)
                continue

            key, sep, value = item_text.partition(":")
            if sep:
                item: dict[str, Any] = {key.strip(): _coerce_scalar(value.strip()) if value.strip() else {}}
                index += 1
                if index < len(lines) and lines[index][0] > indent:
                    child, index = _parse_block(lines, index, lines[index][0])
                    if isinstance(child, dict):
                        item.update(child)
                    else:
                        item[key.strip()] = child
                result.append(item)
            else:
                result.append(_coerce_scalar(item_text))
                index += 1
        return result, index

    result: dict[str, Any] = {}
    while index < len(lines):
        current_indent, line = lines[index]
        if current_indent < indent or line.startswith("- "):
            break
        if current_indent > indent:
            break

        key, sep, value = line.partition(":")
        if not sep:
            raise ValueError(f"Invalid YAML line: {line}")
        key = key.strip()
        value = value.strip()
        index += 1
        if value:
            result[key] = _coerce_scalar(value)
            continue

        if index < len(lines) and lines[index][0] > current_indent:
            child, index = _parse_block(lines, index, lines[index][0])
            result[key] = child
        else:
            result[key] = {}
    return result, index


def _coerce_scalar(value: str) -> Any:
    if value == "true":
        return True
    if value == "false":
        return False
    if value == "[]":
        return []
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [item.strip().strip("\"'") for item in inner.split(",")]
    if value.isdigit():
        return int(value)
    return value.strip("\"'")
