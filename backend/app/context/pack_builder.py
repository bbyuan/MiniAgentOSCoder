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
    compressed: list[str] = []
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
            compressed.append(item.id)
        else:
            omitted.append(item.id)

    pack = ContextPack(
        run_id=run_id,
        required_items=[item.id for item in selected_items if any(item.id == required_item.id for required_item in required)],
        selected_items=[item.id for item in selected_items],
        compressed_items=compressed,
        omitted_items=omitted,
        budget_report=ContextPackBudget(max_tokens=max_tokens, used_tokens=used, remaining_tokens=max_tokens - used),
    )
    return pack, all_items


def explain_context_items(items: list[ContextItem], pack: ContextPack) -> list[dict[str, object]]:
    states = {item_id: "selected" for item_id in pack.selected_items}
    states.update({item_id: "compressed" for item_id in pack.compressed_items})
    states.update({item_id: "omitted" for item_id in pack.omitted_items})
    return [
        {
            "id": item.id,
            "source": item.source,
            "reason": item.reason,
            "tokens": item.tokens,
            "priority": item.priority,
            "state": states.get(item.id, "unknown"),
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
