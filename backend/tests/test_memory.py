from pathlib import Path

import pytest

from app.context import MemoryStore, MemoryStoreError
from app.models import MemoryScope


def test_memory_store_requires_confirmation_for_long_term(tmp_path: Path) -> None:
    memory = MemoryStore(tmp_path)

    with pytest.raises(MemoryStoreError, match="confirmation"):
        memory.create(
            scope=MemoryScope.LONG_TERM,
            kind="preference",
            content="Prefer focused unit tests",
            source="user",
        )

    entry = memory.create(
        scope=MemoryScope.LONG_TERM,
        kind="preference",
        content="Prefer focused unit tests",
        source="user",
        confirmed=True,
    )

    assert memory.list(MemoryScope.LONG_TERM)[0].memory_id == entry.memory_id
    assert (tmp_path / ".agent" / "memory" / "long-term.json").is_file()


def test_memory_store_rejects_secrets_and_supports_update_delete(tmp_path: Path) -> None:
    memory = MemoryStore(tmp_path)

    with pytest.raises(MemoryStoreError, match="secret"):
        memory.create(
            scope=MemoryScope.PROJECT,
            kind="note",
            content="api_key=do-not-store-this",
            source="user",
        )

    entry = memory.create(
        scope=MemoryScope.PROJECT,
        kind="command",
        content="Use make verify before commits",
        source="user",
    )
    updated = memory.update(
        entry.memory_id,
        content="Use make verify before every push",
        kind="command",
        tags=["workflow"],
        confirmed=False,
    )
    deleted = memory.delete(entry.memory_id)

    assert updated.tags == ["workflow"]
    assert deleted.memory_id == entry.memory_id
    assert memory.list(MemoryScope.PROJECT) == []


def test_memory_store_rejects_symlink_escape(tmp_path: Path) -> None:
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    (tmp_path / ".agent").mkdir()
    (tmp_path / ".agent" / "memory").symlink_to(outside, target_is_directory=True)

    with pytest.raises(MemoryStoreError, match="escapes"):
        MemoryStore(tmp_path).list(MemoryScope.PROJECT)
