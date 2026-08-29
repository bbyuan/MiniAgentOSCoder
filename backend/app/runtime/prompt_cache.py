from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
from hashlib import sha256
import json
from threading import RLock
import time
from typing import Callable

from app.runtime.model_client import ModelRequest, ModelResponse


CACHEABLE_ACTIONS = frozenset({"git_diff", "list_files", "read_file", "search_code"})


@dataclass(slots=True)
class PromptCacheEntry:
    response: ModelResponse
    action_type: str
    created_at: float


@dataclass
class PromptCache:
    max_entries: int = 128
    ttl_seconds: float = 1800
    clock: Callable[[], float] = time.monotonic
    _entries: OrderedDict[str, PromptCacheEntry] = field(default_factory=OrderedDict, init=False)
    _lock: RLock = field(default_factory=RLock, init=False)

    def key_for(self, request: ModelRequest) -> str:
        canonical = json.dumps(
            request.to_dict(),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return sha256(canonical.encode("utf-8")).hexdigest()

    def get(self, request: ModelRequest) -> tuple[str, ModelResponse, str] | None:
        key = self.key_for(request)
        now = self.clock()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if now - entry.created_at > self.ttl_seconds:
                self._entries.pop(key, None)
                return None
            self._entries.move_to_end(key)
            return key, _copy_response(entry.response, cache_hit=True), entry.action_type

    def put(self, request: ModelRequest, response: ModelResponse, action_type: str) -> str | None:
        if action_type not in CACHEABLE_ACTIONS or self.max_entries <= 0 or self.ttl_seconds <= 0:
            return None
        key = self.key_for(request)
        with self._lock:
            self._entries[key] = PromptCacheEntry(
                response=_copy_response(response, cache_hit=False),
                action_type=action_type,
                created_at=self.clock(),
            )
            self._entries.move_to_end(key)
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)
        return key

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)


def _copy_response(response: ModelResponse, *, cache_hit: bool) -> ModelResponse:
    metadata = dict(response.metadata)
    metadata["cache_hit"] = cache_hit
    return ModelResponse(
        content=response.content,
        model=response.model,
        usage={} if cache_hit else dict(response.usage),
        metadata=metadata,
    )
