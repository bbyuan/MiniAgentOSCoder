from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import re

from app.context.indexer import WorkspaceIndex, build_workspace_index, load_workspace_index
from app.context.pack_builder import ContextCandidate
from app.guards import redact_secrets


ASCII_TERM = re.compile(r"[A-Za-z_][A-Za-z0-9_.\-/]{1,}")
CHINESE_SEQUENCE = re.compile(r"[\u4e00-\u9fff]{2,}")
STOP_TERMS = {
    "and", "code", "current", "file", "for", "from", "into", "project", "the", "this", "with",
    "代码", "功能", "实现", "项目", "当前", "进行", "这个", "需要",
}
LOW_SIGNAL_TERMS = {"fix", "repair", "run", "spec", "test", "tests", "修复", "运行", "测试"}
TERM_ALIASES = {
    "计算器": {"calculator"},
    "加法": {"add", "addition"},
    "减法": {"subtract", "subtraction"},
    "测试": {"test", "tests", "spec"},
    "登录": {"auth", "login"},
    "用户": {"user"},
    "配置": {"config", "settings"},
    "前端": {"frontend", "tsx", "react"},
    "后端": {"backend", "api", "server"},
}


def discover_project_rules(workspace_root: str | Path, *, max_chars: int = 12000) -> list[ContextCandidate]:
    root = Path(workspace_root).resolve()
    candidates: list[ContextCandidate] = []
    for path in (root / "AGENTS.md", root / ".agent" / "AGENTS.md"):
        if not path.is_file():
            continue
        try:
            content = redact_secrets(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError):
            continue
        bounded = _bound_text(content, max_chars)
        relative = str(path.relative_to(root))
        candidates.append(
            ContextCandidate(
                id=f"project-rules:{relative}",
                type="project_rules",
                source=relative,
                reason="applicable workspace instructions",
                content=bounded,
                priority=1.0,
                metadata={"trusted": True, "bounded": len(bounded) < len(content)},
            )
        )
    return candidates


def retrieve_workspace_context(
    workspace_root: str | Path,
    task: str,
    project_profile: dict[str, object] | None = None,
    *,
    max_snippets: int = 10,
    max_per_file: int = 2,
) -> list[ContextCandidate]:
    root = Path(workspace_root).resolve()
    index = _load_or_build_index(root)
    terms = _task_terms(task)
    file_metadata = {str(item.get("path", "")): item for item in index.files}
    symbols_by_path: dict[str, list[str]] = defaultdict(list)
    for symbol in index.symbols:
        symbols_by_path[str(symbol.get("path", ""))].append(str(symbol.get("name", "")))

    scored: list[tuple[float, dict[str, object], set[str]]] = []
    path_scores: dict[str, float] = defaultdict(float)
    for snippet in index.snippets:
        path = str(snippet.get("path", ""))
        content = str(snippet.get("content", ""))
        score, matched = _score_snippet(path, content, symbols_by_path.get(path, []), terms)
        metadata = file_metadata.get(path, {})
        if bool(metadata.get("is_test")) and _task_mentions_tests(terms):
            score += 1.25
        if path in _entrypoints(project_profile):
            score += 0.75
        if score > 0:
            scored.append((score, snippet, matched))
            path_scores[path] = max(path_scores[path], score)

    relation_boosts = _relation_boosts(index, path_scores)
    if relation_boosts:
        scored = [
            (score + relation_boosts.get(str(snippet.get("path", "")), 0.0), snippet, matched)
            for score, snippet, matched in scored
        ]

    if not scored:
        scored = _fallback_snippets(index, project_profile)

    selected: list[ContextCandidate] = []
    per_file: dict[str, int] = defaultdict(int)
    for score, snippet, matched in sorted(
        scored,
        key=lambda item: (-item[0], str(item[1].get("path", "")), int(item[1].get("start_line", 0))),
    ):
        path = str(snippet.get("path", ""))
        if per_file[path] >= max_per_file:
            continue
        per_file[path] += 1
        start_line = int(snippet.get("start_line", 1))
        end_line = int(snippet.get("end_line", start_line))
        content = redact_secrets(str(snippet.get("content", "")))
        matched_terms = sorted(matched)
        reason = (
            f"task match: {', '.join(matched_terms[:6])}"
            if matched_terms
            else "entrypoint or test fallback"
        )
        selected.append(
            ContextCandidate(
                id=f"snippet:{path}:{start_line}-{end_line}",
                type="test_snippet" if bool(file_metadata.get(path, {}).get("is_test")) else "file_snippet",
                source=path,
                reason=reason,
                content=f"{path}:{start_line}-{end_line}\n{content}",
                priority=min(0.96, 0.58 + score / 24),
                metadata={
                    "path": path,
                    "start_line": start_line,
                    "end_line": end_line,
                    "score": round(score, 3),
                    "matched_terms": matched_terms,
                },
            )
        )
        if len(selected) >= max_snippets:
            break
    return selected


def _load_or_build_index(root: Path) -> WorkspaceIndex:
    try:
        return load_workspace_index(root / ".agent" / "index")
    except (FileNotFoundError, OSError, UnicodeDecodeError, ValueError):
        return build_workspace_index(root, root / ".agent" / "index")


def _task_terms(task: str) -> set[str]:
    lowered = task.lower()
    terms: set[str] = set()
    for match in ASCII_TERM.finditer(lowered):
        raw_term = match.group(0).strip("./-")
        terms.add(raw_term)
        terms.update(part for part in re.split(r"[./_-]+", raw_term) if len(part) > 1)
    chinese_sequences = [match.group(0) for match in CHINESE_SEQUENCE.finditer(task)]
    for sequence in chinese_sequences:
        terms.add(sequence)
        if len(sequence) > 2:
            terms.update(sequence[index : index + 2] for index in range(len(sequence) - 1))
        for phrase, aliases in TERM_ALIASES.items():
            if phrase in sequence:
                terms.update(aliases)
    return {term for term in terms if len(term) > 1 and term not in STOP_TERMS}


def _score_snippet(path: str, content: str, symbols: list[str], terms: set[str]) -> tuple[float, set[str]]:
    path_lower = path.lower()
    content_lower = content.lower()
    symbol_text = " ".join(symbols).lower()
    score = 0.0
    matched: set[str] = set()
    for term in terms:
        if term in LOW_SIGNAL_TERMS:
            continue
        if term in path_lower:
            score += 5.0
            matched.add(term)
        if term in symbol_text:
            score += 4.0
            matched.add(term)
        occurrences = content_lower.count(term)
        if occurrences:
            score += min(3, occurrences) * 0.8
            matched.add(term)
    return score, matched


def _relation_boosts(index: WorkspaceIndex, path_scores: dict[str, float]) -> dict[str, float]:
    boosts: dict[str, float] = defaultdict(float)
    known_paths = {str(item.get("path", "")) for item in index.files}
    stems = {Path(path).stem.lower(): path for path in known_paths}
    for relation in index.relations:
        source = str(relation.get("path", ""))
        target_value = str(relation.get("target", ""))
        target = target_value if target_value in known_paths else stems.get(target_value.rsplit(".", 1)[-1].lower())
        if target is None:
            continue
        if path_scores.get(source, 0) > 0:
            boosts[target] = max(boosts[target], 1.5)
        if path_scores.get(target, 0) > 0:
            boosts[source] = max(boosts[source], 1.5 if relation.get("type") == "test_of" else 0.75)
    return boosts


def _fallback_snippets(
    index: WorkspaceIndex,
    project_profile: dict[str, object] | None,
) -> list[tuple[float, dict[str, object], set[str]]]:
    entrypoints = _entrypoints(project_profile)
    file_metadata = {str(item.get("path", "")): item for item in index.files}
    preferred = [
        snippet
        for snippet in index.snippets
        if str(snippet.get("path", "")) in entrypoints
        or bool(file_metadata.get(str(snippet.get("path", "")), {}).get("is_test"))
    ]
    if not preferred:
        preferred = list(index.snippets)
    return [(0.8, snippet, set()) for snippet in preferred[:4]]


def _entrypoints(project_profile: dict[str, object] | None) -> set[str]:
    if not project_profile:
        return set()
    values = project_profile.get("entrypoints", [])
    return {str(value) for value in values} if isinstance(values, list) else set()


def _task_mentions_tests(terms: set[str]) -> bool:
    return bool({"test", "tests", "pytest", "spec"} & terms)


def _bound_text(content: str, max_chars: int) -> str:
    if len(content) <= max_chars:
        return content
    tail_size = max(0, max_chars // 4)
    head_size = max_chars - tail_size - 48
    return f"{content[:head_size]}\n...[project rules bounded]...\n{content[-tail_size:]}"
