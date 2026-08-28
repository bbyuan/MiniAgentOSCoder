from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from threading import RLock
from uuid import uuid4

from app.guards import redact_secrets
from app.models import MemoryEntry, MemoryScope, RunArtifacts, RunLoopResult, RunState


class MemoryStoreError(ValueError):
    pass


_MEMORY_LOCK = RLock()
_MAX_CONTENT_LENGTH = 2000


class MemoryStore:
    def __init__(self, workspace: str | Path) -> None:
        self.workspace = Path(workspace).resolve()
        self.memory_dir = self.workspace / ".agent" / "memory"

    def list(self, scope: MemoryScope) -> list[MemoryEntry]:
        if scope == MemoryScope.SHORT_TERM:
            raise MemoryStoreError("Short-term memory is synthesized from the active run")
        path = self._path(scope)
        with _MEMORY_LOCK:
            if not path.exists():
                return []
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise MemoryStoreError(f"Memory file is invalid: {scope.value}") from exc
        return [_entry_from_dict(item) for item in data.get("entries", [])]

    def create(
        self,
        *,
        scope: MemoryScope,
        kind: str,
        content: str,
        source: str,
        run_id: str | None = None,
        tags: list[str] | None = None,
        confirmed: bool = False,
        memory_id: str | None = None,
    ) -> MemoryEntry:
        self._validate_write(scope, content, confirmed)
        entries = self.list(scope)
        now = datetime.now(timezone.utc).isoformat()
        entry = MemoryEntry(
            memory_id=memory_id or f"mem-{uuid4().hex[:12]}",
            scope=scope,
            kind=kind.strip() or "note",
            content=content.strip(),
            source=source,
            created_at=now,
            updated_at=now,
            run_id=run_id,
            tags=sorted(set(tags or [])),
        )
        entries = [item for item in entries if item.memory_id != entry.memory_id]
        entries.append(entry)
        self._write(scope, entries)
        return entry

    def update(
        self,
        memory_id: str,
        *,
        content: str,
        kind: str,
        tags: list[str] | None,
        confirmed: bool,
    ) -> MemoryEntry:
        for scope in (MemoryScope.PROJECT, MemoryScope.LONG_TERM):
            entries = self.list(scope)
            for entry in entries:
                if entry.memory_id != memory_id:
                    continue
                self._validate_write(scope, content, confirmed)
                entry.content = content.strip()
                entry.kind = kind.strip() or entry.kind
                entry.tags = sorted(set(tags or []))
                entry.updated_at = datetime.now(timezone.utc).isoformat()
                self._write(scope, entries)
                return entry
        raise MemoryStoreError("Memory entry not found")

    def delete(self, memory_id: str) -> MemoryEntry:
        for scope in (MemoryScope.PROJECT, MemoryScope.LONG_TERM):
            entries = self.list(scope)
            found = next((item for item in entries if item.memory_id == memory_id), None)
            if found is not None:
                self._write(scope, [item for item in entries if item.memory_id != memory_id])
                return found
        raise MemoryStoreError("Memory entry not found")

    def _write(self, scope: MemoryScope, entries: list[MemoryEntry]) -> None:
        path = self._path(scope)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": 1, "scope": scope.value, "entries": [entry.to_dict() for entry in entries]}
        temporary = path.with_suffix(".tmp")
        with _MEMORY_LOCK:
            temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(path)

    def _path(self, scope: MemoryScope) -> Path:
        if scope == MemoryScope.PROJECT:
            path = self.memory_dir / "project.json"
        elif scope == MemoryScope.LONG_TERM:
            path = self.memory_dir / "long-term.json"
        else:
            raise MemoryStoreError("Short-term memory cannot be persisted")
        if not path.parent.resolve().is_relative_to(self.workspace):
            raise MemoryStoreError("Memory path escapes the workspace")
        return path

    @staticmethod
    def _validate_write(scope: MemoryScope, content: str, confirmed: bool) -> None:
        text = content.strip()
        if not text:
            raise MemoryStoreError("Memory content must not be empty")
        if len(text) > _MAX_CONTENT_LENGTH:
            raise MemoryStoreError(f"Memory content exceeds {_MAX_CONTENT_LENGTH} characters")
        if redact_secrets(text) != text:
            raise MemoryStoreError("Memory content appears to contain a secret")
        if scope == MemoryScope.SHORT_TERM:
            raise MemoryStoreError("Short-term memory is read-only")
        if scope == MemoryScope.LONG_TERM and not confirmed:
            raise MemoryStoreError("Long-term memory requires explicit confirmation")


def build_short_term_memory(run: RunState, artifacts: RunArtifacts | None = None) -> list[MemoryEntry]:
    plan = " -> ".join(f"{step.title} ({step.state})" for step in artifacts.plan) if artifacts else "Plan unavailable"
    values = [
        ("task", run.task),
        ("plan", plan),
        ("observation", str(run.last_observation) if run.last_observation else "No observation yet"),
        ("workspace", f"Changed files: {', '.join(run.changed_files) or 'none'}; test: {run.test_status or 'not run'}"),
        ("budget", json.dumps(run.budget, ensure_ascii=False, sort_keys=True) if run.budget else "No usage yet"),
    ]
    return [
        MemoryEntry(
            memory_id=f"short-{run.run_id}-{kind}",
            scope=MemoryScope.SHORT_TERM,
            kind=kind,
            content=redact_secrets(content)[:_MAX_CONTENT_LENGTH],
            source="runtime",
            run_id=run.run_id,
        )
        for kind, content in values
    ]


def consolidate_run_memory(
    store: MemoryStore,
    run: RunState,
    result: RunLoopResult,
    artifacts: RunArtifacts | None,
) -> MemoryEntry:
    test = artifacts.test_summary if artifacts is not None else None
    content = "\n".join(
        [
            f"Task: {run.task}",
            f"Outcome: {result.status.value} ({result.termination_reason})",
            f"Changed files: {', '.join(run.changed_files) or 'none'}",
            f"Validation: {test.status if test is not None else 'Not run'}; command: {test.command if test is not None else 'Not selected'}",
            f"Repair attempts: {run.repair_attempts}",
        ]
    )
    return store.create(
        scope=MemoryScope.PROJECT,
        kind="run_summary",
        content=redact_secrets(content),
        source="run_finalize",
        run_id=run.run_id,
        tags=[run.mode.lower(), result.status.value],
        memory_id=f"mem-run-{run.run_id}",
    )


def _entry_from_dict(data: dict[str, object]) -> MemoryEntry:
    return MemoryEntry(
        memory_id=str(data["memory_id"]),
        scope=MemoryScope(str(data["scope"])),
        kind=str(data.get("kind", "note")),
        content=str(data.get("content", "")),
        source=str(data.get("source", "unknown")),
        created_at=str(data.get("created_at", "")),
        updated_at=str(data.get("updated_at", "")),
        run_id=str(data["run_id"]) if data.get("run_id") is not None else None,
        tags=[str(tag) for tag in data.get("tags", [])],
    )
