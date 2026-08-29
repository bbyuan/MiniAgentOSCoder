from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from app.context.workspace_scan import IGNORED_DIRS, LANGUAGE_BY_SUFFIX
from app.models.base import Serializable


@dataclass(slots=True)
class WorkspaceIndex(Serializable):
    files: list[dict[str, object]] = field(default_factory=list)
    symbols: list[dict[str, object]] = field(default_factory=list)
    relations: list[dict[str, object]] = field(default_factory=list)
    snippets: list[dict[str, object]] = field(default_factory=list)


def build_workspace_index(workspace_root: str | Path, output_dir: str | Path | None = None) -> WorkspaceIndex:
    root = Path(workspace_root).resolve()
    index = WorkspaceIndex()

    for path in sorted(root.rglob("*")):
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if not path.is_file():
            continue

        relative = path.relative_to(root)
        language = LANGUAGE_BY_SUFFIX.get(path.suffix, "text")
        index.files.append(
            {
                "path": str(relative),
                "language": language,
                "size": path.stat().st_size,
                "is_test": _is_test_file(relative),
            }
        )

        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        index.symbols.extend(_extract_symbols(relative, text, language))
        index.relations.extend(_extract_relations(relative, text, language))
        index.snippets.extend(_extract_snippets(relative, text))

    index.relations.extend(_infer_test_relations(index.files))

    if output_dir is not None:
        write_workspace_index(index, output_dir)
    return index


def load_workspace_index(output_dir: str | Path) -> WorkspaceIndex:
    source = Path(output_dir)
    files = _read_json_list(source / "files.json")
    symbols = _read_json_list(source / "symbols.json")
    relations = _read_json_list(source / "relations.json")
    snippets: list[dict[str, object]] = []
    with (source / "snippets.jsonl").open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError("Workspace snippet index must contain JSON objects")
            snippets.append(value)
    return WorkspaceIndex(files=files, symbols=symbols, relations=relations, snippets=snippets)


def write_workspace_index(index: WorkspaceIndex, output_dir: str | Path) -> None:
    target = Path(output_dir)
    target.mkdir(parents=True, exist_ok=True)
    payload = index.to_dict()
    for name in ["files", "symbols", "relations"]:
        (target / f"{name}.json").write_text(json.dumps(payload[name], ensure_ascii=False, indent=2), encoding="utf-8")
    with (target / "snippets.jsonl").open("w", encoding="utf-8") as handle:
        for snippet in payload["snippets"]:
            handle.write(json.dumps(snippet, ensure_ascii=False) + "\n")


def _is_test_file(path: Path) -> bool:
    text = str(path)
    return "test" in text.lower() or text.endswith(".spec.ts") or text.endswith(".test.ts")


def _extract_symbols(path: Path, text: str, language: str) -> list[dict[str, object]]:
    if language == "python":
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []
        symbols: list[dict[str, object]] = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                symbols.append({"path": str(path), "name": node.name, "kind": type(node).__name__, "line": node.lineno})
        return symbols

    if language in {"typescript", "javascript"}:
        pattern = re.compile(r"(?:function|class)\s+([A-Za-z_][A-Za-z0-9_]*)|export\s+(?:const|function|class)\s+([A-Za-z_][A-Za-z0-9_]*)")
        return [
            {"path": str(path), "name": first or second, "kind": "js_symbol", "line": text[: match.start()].count("\n") + 1}
            for match in pattern.finditer(text)
            for first, second in [match.groups()]
        ]

    return []


def _extract_relations(path: Path, text: str, language: str) -> list[dict[str, object]]:
    relations: list[dict[str, object]] = []
    if language == "python":
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    relations.append({"path": str(path), "type": "import", "target": alias.name})
            elif isinstance(node, ast.ImportFrom) and node.module:
                relations.append({"path": str(path), "type": "import", "target": node.module})
    elif language in {"typescript", "javascript"}:
        for match in re.finditer(r"from\s+['\"]([^'\"]+)['\"]", text):
            relations.append({"path": str(path), "type": "import", "target": match.group(1)})
    return relations


def _extract_snippets(path: Path, text: str) -> list[dict[str, object]]:
    lines = text.splitlines()
    snippets: list[dict[str, object]] = []
    for start in range(0, len(lines), 40):
        chunk = lines[start : start + 40]
        if not chunk:
            continue
        snippets.append(
            {
                "path": str(path),
                "start_line": start + 1,
                "end_line": start + len(chunk),
                "content": "\n".join(chunk),
            }
        )
    return snippets


def _infer_test_relations(files: list[dict[str, object]]) -> list[dict[str, object]]:
    source_paths = [str(item.get("path", "")) for item in files if not bool(item.get("is_test"))]
    relations: list[dict[str, object]] = []
    for item in files:
        if not bool(item.get("is_test")):
            continue
        test_path = str(item.get("path", ""))
        test_stem = _normalized_test_stem(Path(test_path).stem)
        if not test_stem:
            continue
        matches = [
            source_path
            for source_path in source_paths
            if Path(source_path).stem.lower() == test_stem
        ]
        for source_path in matches:
            relations.append({"path": test_path, "type": "test_of", "target": source_path})
    return relations


def _normalized_test_stem(stem: str) -> str:
    normalized = stem.lower()
    for prefix in ("test_", "spec_"):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix) :]
    for suffix in ("_test", "_spec", ".test", ".spec"):
        if normalized.endswith(suffix):
            normalized = normalized[: -len(suffix)]
    return normalized


def _read_json_list(path: Path) -> list[dict[str, object]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ValueError(f"Workspace index file must contain a list of objects: {path.name}")
    return value
