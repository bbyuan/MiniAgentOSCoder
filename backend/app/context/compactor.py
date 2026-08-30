from __future__ import annotations

from dataclasses import dataclass, field

from app.context.pack_builder import refresh_context_pack
from app.models import ContextItem, ContextPack
from app.models.base import Serializable


PROTECTED_TYPES = {
    "user_task",
    "current_plan",
    "latest_observation",
    "current_diff",
    "runtime_budget",
    "project_protocol",
    "project_rules",
    "resume_checkpoint",
}


@dataclass(slots=True)
class CompactionResult(Serializable):
    status: str
    before_tokens: int
    after_tokens: int
    target_tokens: int
    compacted_items: list[str] = field(default_factory=list)
    omitted_items: list[str] = field(default_factory=list)
    threshold_state: str = "normal"
    confirmation_required: bool = False
    reason: str = ""


def compact_context_pack(
    pack: ContextPack,
    *,
    force: bool = False,
    target_ratio: float = 0.55,
    confirmed: bool = False,
) -> CompactionResult:
    refresh_context_pack(pack)
    budget = pack.budget_report
    if budget is None:
        return CompactionResult("skipped", 0, 0, 0, reason="Context budget is unavailable")

    before = budget.used_tokens
    ratio = before / budget.max_tokens if budget.max_tokens else 0.0
    target_ratio = min(0.85, max(0.25, target_ratio))
    target = max(1, int(budget.max_tokens * target_ratio))
    if ratio >= 0.95 and not confirmed:
        return CompactionResult(
            status="confirmation_required",
            before_tokens=before,
            after_tokens=before,
            target_tokens=target,
            threshold_state=pack.threshold_state,
            confirmation_required=True,
            reason="Context is at the critical threshold; confirmation is required",
        )
    if ratio < 0.70 and not force:
        return CompactionResult(
            status="skipped",
            before_tokens=before,
            after_tokens=before,
            target_tokens=target,
            threshold_state=pack.threshold_state,
            reason="Context usage is below the automatic compaction threshold",
        )

    included = set(pack.selected_items + pack.compressed_items)
    candidates = sorted(
        (item for item in pack.items if item.id in included and item.type not in PROTECTED_TYPES),
        key=lambda item: (item.priority, -item.tokens, item.id),
    )
    compacted: list[str] = []
    omitted: list[str] = []
    for item in candidates:
        if _used_tokens(pack) <= target:
            break
        if not item.metadata.get("compacted") and item.tokens > 24:
            original_tokens = item.tokens
            item.content = _summarize(item)
            item.tokens = max(1, len(item.content) // 4)
            item.metadata.update({"compacted": True, "original_tokens": original_tokens})
            if item.id in pack.selected_items:
                pack.selected_items.remove(item.id)
            if item.id not in pack.compressed_items:
                pack.compressed_items.append(item.id)
            compacted.append(item.id)
        elif item.id not in pack.required_items:
            if item.id in pack.selected_items:
                pack.selected_items.remove(item.id)
            if item.id in pack.compressed_items:
                pack.compressed_items.remove(item.id)
            if item.id not in pack.omitted_items:
                pack.omitted_items.append(item.id)
            omitted.append(item.id)

    if compacted or omitted:
        pack.compaction_count += 1
    refresh_context_pack(pack)
    after = pack.budget_report.used_tokens if pack.budget_report is not None else before
    return CompactionResult(
        status="compacted" if after < before else "skipped",
        before_tokens=before,
        after_tokens=after,
        target_tokens=target,
        compacted_items=compacted,
        omitted_items=omitted,
        threshold_state=pack.threshold_state,
        reason="Context compacted deterministically" if after < before else "No compressible context items were available",
    )


def add_observation_item(pack: ContextPack, *, step: int, action_type: str, content: str, ok: bool) -> ContextItem:
    for item in pack.items:
        if item.type == "latest_observation":
            item.type = "tool_history"
            item.priority = min(item.priority, 0.45)

    safe_content = content.strip() or "No tool output"
    item = ContextItem(
        id=f"observation-{step}-{len(pack.items) + 1}",
        type="latest_observation",
        source=action_type,
        reason="latest successful tool result" if ok else "latest tool error",
        tokens=max(1, len(safe_content) // 4),
        priority=0.98,
        content=safe_content,
        metadata={"ok": ok, "step": step},
    )
    pack.items.append(item)
    pack.selected_items.append(item.id)
    refresh_context_pack(pack)
    return item


def set_current_diff_item(pack: ContextPack, *, step: int, content: str) -> ContextItem:
    previous_ids = {item.id for item in pack.items if item.type == "current_diff"}
    if previous_ids:
        pack.items = [item for item in pack.items if item.id not in previous_ids]
        pack.required_items = [item_id for item_id in pack.required_items if item_id not in previous_ids]
        pack.selected_items = [item_id for item_id in pack.selected_items if item_id not in previous_ids]
        pack.compressed_items = [item_id for item_id in pack.compressed_items if item_id not in previous_ids]
        pack.omitted_items = [item_id for item_id in pack.omitted_items if item_id not in previous_ids]

    safe_content = content.strip() or "No patch content"
    item = ContextItem(
        id=f"current-diff-{step}",
        type="current_diff",
        source="patch.diff",
        reason="latest applied workspace change",
        tokens=max(1, len(safe_content) // 4),
        priority=0.99,
        content=safe_content,
        metadata={"step": step},
    )
    pack.items.append(item)
    pack.selected_items.append(item.id)
    refresh_context_pack(pack)
    return item


def _used_tokens(pack: ContextPack) -> int:
    included = set(pack.selected_items + pack.compressed_items)
    return sum(item.tokens for item in pack.items if item.id in included)


def _summarize(item: ContextItem, limit: int = 240) -> str:
    text = item.content.strip()
    if len(text) <= limit:
        return text
    half = (limit - 96) // 2
    return (
        f"[Compacted {item.type}; original estimate {item.tokens} tokens]\n"
        f"{text[:half]}\n...[middle omitted]...\n{text[-half:]}"
    )
