from __future__ import annotations

from dataclasses import dataclass

from app.models import ContextItem, ContextPack, ContextPackBudget


@dataclass(slots=True)
class ContextCandidate:
    id: str
    type: str
    source: str
    reason: str
    content: str
    priority: float

    @property
    def tokens(self) -> int:
        return max(1, len(self.content) // 4)


def build_context_pack(
    run_id: str,
    required: list[ContextCandidate],
    candidates: list[ContextCandidate],
    max_tokens: int,
) -> tuple[ContextPack, list[ContextItem]]:
    all_items: list[ContextItem] = []
    selected_items: list[ContextItem] = []
    compressed: list[ContextItem] = []
    omitted: list[str] = []
    used = 0

    for candidate in required:
        item = _to_item(candidate)
        all_items.append(item)
        selected_items.append(item)
        used += item.tokens

    for candidate in sorted(candidates, key=lambda item: item.priority, reverse=True):
        item = _to_item(candidate)
        all_items.append(item)
        if used + item.tokens <= max_tokens:
            selected_items.append(item)
            used += item.tokens
        elif item.tokens > max_tokens // 3:
            original_tokens = item.tokens
            item.content = _initial_summary(item.content, limit=max(32, (max_tokens - used) * 4))
            item.tokens = _estimate_tokens(item.content)
            item.metadata.update({"compacted": True, "original_tokens": original_tokens})
            if used + item.tokens <= max_tokens:
                compressed.append(item)
                used += item.tokens
            else:
                omitted.append(item.id)
        else:
            omitted.append(item.id)

    pack = ContextPack(
        run_id=run_id,
        items=all_items,
        required_items=[item.id for item in selected_items if any(item.id == required_item.id for required_item in required)],
        selected_items=[item.id for item in selected_items],
        compressed_items=[item.id for item in compressed],
        omitted_items=omitted,
        budget_report=ContextPackBudget(max_tokens=max_tokens, used_tokens=used, remaining_tokens=max_tokens - used),
    )
    refresh_context_pack(pack)
    return pack, all_items


def explain_context_items(items: list[ContextItem], pack: ContextPack) -> list[dict[str, object]]:
    states = {item_id: "selected" for item_id in pack.selected_items}
    states.update({item_id: "compressed" for item_id in pack.compressed_items})
    states.update({item_id: "omitted" for item_id in pack.omitted_items})
    return [
        {
            "id": item.id,
            "type": item.type,
            "source": item.source,
            "reason": item.reason,
            "tokens": item.tokens,
            "priority": item.priority,
            "state": states.get(item.id, "unknown"),
            "summary": _display_summary(item.content),
        }
        for item in items
    ]


def _to_item(candidate: ContextCandidate) -> ContextItem:
    return ContextItem(
        id=candidate.id,
        type=candidate.type,
        source=candidate.source,
        reason=candidate.reason,
        tokens=candidate.tokens,
        priority=candidate.priority,
        content=candidate.content,
    )


def refresh_context_pack(pack: ContextPack) -> None:
    included = set(pack.selected_items + pack.compressed_items)
    used = sum(item.tokens for item in pack.items if item.id in included)
    maximum = pack.budget_report.max_tokens if pack.budget_report is not None else max(used, 1)
    pack.budget_report = ContextPackBudget(
        max_tokens=maximum,
        used_tokens=used,
        remaining_tokens=max(0, maximum - used),
    )
    composition: dict[str, int] = {}
    for item in pack.items:
        if item.id in included:
            composition[item.type] = composition.get(item.type, 0) + item.tokens
    pack.composition = composition
    ratio = used / maximum if maximum else 0.0
    pack.threshold_state = (
        "critical" if ratio >= 0.95 else "high" if ratio >= 0.85 else "warning" if ratio >= 0.70 else "normal"
    )


def _estimate_tokens(content: str) -> int:
    return max(1, len(content) // 4)


def _initial_summary(content: str, limit: int = 480) -> str:
    text = content.strip()
    if len(text) <= limit:
        return text
    half = (limit - 48) // 2
    return f"{text[:half]}\n...[deterministic compaction]...\n{text[-half:]}"


def _display_summary(content: str, limit: int = 180) -> str:
    text = " ".join(content.split())
    return text if len(text) <= limit else f"{text[:limit]}..."
