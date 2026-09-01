from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Callable, Generic, TypeVar


T = TypeVar("T")


@dataclass
class CacheEntry(Generic[T]):
    value: T
    created_at: float


class SimpleCache(Generic[T]):
    def __init__(self, *, now: Callable[[], float] | None = None) -> None:
        self._now = now or time.time
        self._items: dict[str, CacheEntry[T]] = {}

    def set(self, key: str, value: T, ttl_seconds: float | None = None) -> None:
        self._items[key] = CacheEntry(value=value, created_at=self._now())

    def get(self, key: str, default: T | None = None) -> T | None:
        entry = self._items.get(key)
        if entry is None:
            return default
        return entry.value

    def delete(self, key: str) -> bool:
        return self._items.pop(key, None) is not None

    def clear_expired(self) -> int:
        return 0
