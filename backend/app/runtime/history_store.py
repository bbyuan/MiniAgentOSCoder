from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import sqlite3
from threading import RLock
from typing import Any

from app.models import RunArtifacts, RunLoopResult, RunState


TERMINAL_STATUSES = {"completed", "failed", "cancelled", "interrupted"}


def default_history_path() -> Path:
    home = Path(os.environ.get("MINIAGENTOS_HOME", "~/.miniagentos-coder")).expanduser()
    return home / "state.db"


def stable_project_id(path: str | Path) -> str:
    canonical = str(Path(path).expanduser().resolve())
    return f"proj-{sha256(canonical.encode('utf-8')).hexdigest()[:12]}"


class HistoryStore:
    def __init__(self, path: str | Path = ":memory:") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).expanduser().parent.mkdir(parents=True, exist_ok=True)
            self.path = str(Path(self.path).expanduser().resolve())
        self._lock = RLock()
        self._connection = sqlite3.connect(self.path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._configure()
        self._migrate()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def clear(self) -> None:
        with self._transaction() as connection:
            connection.execute("DELETE FROM runs")
            connection.execute("DELETE FROM projects")

    def upsert_project(self, path: str | Path, profile: dict[str, Any]) -> dict[str, Any]:
        canonical = str(Path(path).expanduser().resolve())
        project_id = stable_project_id(canonical)
        now = _now()
        with self._transaction() as connection:
            connection.execute(
                """
                INSERT INTO projects(project_id, canonical_path, profile_json, created_at, last_opened_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    canonical_path=excluded.canonical_path,
                    profile_json=excluded.profile_json,
                    last_opened_at=excluded.last_opened_at
                """,
                (project_id, canonical, _json(profile), now, now),
            )
        return self.get_project(project_id) or {}

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM projects WHERE project_id = ?",
                (project_id,),
            ).fetchone()
        return _project_row(row) if row is not None else None

    def record_run(
        self,
        run: RunState,
        project_id: str,
        workspace: str | Path,
        artifacts: RunArtifacts | None = None,
    ) -> None:
        now = _now()
        root = Path(workspace).resolve()
        run_dir = root / "runs" / run.run_id
        values = _run_values(run, artifacts=artifacts)
        with self._transaction() as connection:
            connection.execute(
                """
                INSERT INTO runs(
                    run_id, project_id, conversation_id, parent_run_id, turn_index,
                    task, mode, status, phase, created_at, updated_at,
                    termination_reason, final_message, budget_json, changed_files_json,
                    applied_patches, repair_attempts, steps, model_calls, tool_calls,
                    input_tokens, output_tokens, total_tokens, test_status,
                    report_path, trace_path, patch_path, archived, completion_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_id) DO NOTHING
                """,
                (
                    run.run_id,
                    project_id,
                    run.conversation_id or run.run_id,
                    run.parent_run_id,
                    run.turn_index,
                    run.task,
                    run.mode,
                    run.status.value,
                    run.status.value,
                    now,
                    now,
                    "",
                    "",
                    values["budget_json"],
                    values["changed_files_json"],
                    run.applied_patches,
                    run.repair_attempts,
                    values["steps"],
                    values["model_calls"],
                    values["tool_calls"],
                    values["input_tokens"],
                    values["output_tokens"],
                    values["total_tokens"],
                    values["test_status"],
                    str(run_dir / "report.md"),
                    str(run_dir / "trace.jsonl"),
                    str(run_dir / "patch.diff"),
                    0,
                    "{}",
                ),
            )

    def update_run(
        self,
        run: RunState,
        *,
        result: RunLoopResult | None = None,
        artifacts: RunArtifacts | None = None,
    ) -> None:
        values = _run_values(run, result=result, artifacts=artifacts)
        completed_at = _now() if run.status.value in TERMINAL_STATUSES else None
        with self._transaction() as connection:
            connection.execute(
                """
                UPDATE runs SET
                    status=?, phase=?, updated_at=?, completed_at=COALESCE(?, completed_at),
                    termination_reason=?, final_message=?, budget_json=?, changed_files_json=?,
                    applied_patches=?, repair_attempts=?, steps=?, model_calls=?, tool_calls=?,
                    input_tokens=?, output_tokens=?, total_tokens=?, test_status=?, completion_json=?
                WHERE run_id=?
                """,
                (
                    run.status.value,
                    run.status.value,
                    _now(),
                    completed_at,
                    result.termination_reason if result is not None else "",
                    result.final_message if result is not None else "",
                    values["budget_json"],
                    values["changed_files_json"],
                    run.applied_patches,
                    run.repair_attempts,
                    values["steps"],
                    values["model_calls"],
                    values["tool_calls"],
                    values["input_tokens"],
                    values["output_tokens"],
                    values["total_tokens"],
                    values["test_status"],
                    values["completion_json"],
                    run.run_id,
                ),
            )

    def mark_interrupted(self) -> int:
        placeholders = ",".join("?" for _ in TERMINAL_STATUSES)
        with self._transaction() as connection:
            cursor = connection.execute(
                f"""
                UPDATE runs SET status='interrupted', updated_at=?, completed_at=?
                WHERE status NOT IN ({placeholders})
                """,
                (_now(), _now(), *sorted(TERMINAL_STATUSES)),
            )
            return cursor.rowcount

    def reopen_run(self, run: RunState, *, artifacts: RunArtifacts | None = None) -> bool:
        values = _run_values(run, artifacts=artifacts)
        with self._transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE runs SET
                    status=?, phase=?, updated_at=?, completed_at=NULL,
                    termination_reason='', final_message='', budget_json=?, changed_files_json=?,
                    applied_patches=?, repair_attempts=?, steps=?, model_calls=?, tool_calls=?,
                    input_tokens=?, output_tokens=?, total_tokens=?, test_status=?, completion_json='{}'
                WHERE run_id=? AND status IN ('interrupted', 'failed', 'cancelled')
                """,
                (
                    run.status.value,
                    run.status.value,
                    _now(),
                    values["budget_json"],
                    values["changed_files_json"],
                    run.applied_patches,
                    run.repair_attempts,
                    values["steps"],
                    values["model_calls"],
                    values["tool_calls"],
                    values["input_tokens"],
                    values["output_tokens"],
                    values["total_tokens"],
                    values["test_status"],
                    run.run_id,
                ),
            )
            return cursor.rowcount > 0

    def list_projects(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT p.*,
                       COUNT(r.run_id) AS run_count,
                       (SELECT status FROM runs latest
                        WHERE latest.project_id=p.project_id
                        ORDER BY latest.updated_at DESC LIMIT 1) AS latest_status,
                       (SELECT updated_at FROM runs latest
                        WHERE latest.project_id=p.project_id
                        ORDER BY latest.updated_at DESC LIMIT 1) AS latest_run_at
                FROM projects p
                LEFT JOIN runs r ON r.project_id=p.project_id
                GROUP BY p.project_id
                ORDER BY p.last_opened_at DESC
                """
            ).fetchall()
        return [_project_row(row) for row in rows]

    def list_runs(
        self,
        *,
        project_id: str | None = None,
        status: str | None = None,
        query: str | None = None,
        include_archived: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        clauses: list[str] = []
        params: list[Any] = []
        if project_id:
            clauses.append("r.project_id = ?")
            params.append(project_id)
        if status:
            clauses.append("r.status = ?")
            params.append(status)
        if query:
            clauses.append("LOWER(r.task) LIKE ?")
            params.append(f"%{query.lower()}%")
        if not include_archived:
            clauses.append("r.archived = 0")
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._lock:
            count = self._connection.execute(
                f"SELECT COUNT(*) FROM runs r {where}",
                params,
            ).fetchone()[0]
            rows = self._connection.execute(
                f"""
                SELECT r.*, p.canonical_path AS project_path
                FROM runs r JOIN projects p ON p.project_id=r.project_id
                {where}
                ORDER BY r.updated_at DESC
                LIMIT ? OFFSET ?
                """,
                (*params, limit, offset),
            ).fetchall()
        return [_run_row(row) for row in rows], int(count)

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute(
                """
                SELECT r.*, p.canonical_path AS project_path, p.profile_json AS project_profile_json
                FROM runs r JOIN projects p ON p.project_id=r.project_id
                WHERE r.run_id=?
                """,
                (run_id,),
            ).fetchone()
        return _run_row(row) if row is not None else None

    def list_conversation(self, run_id: str) -> list[dict[str, Any]]:
        target = self.get_run(run_id)
        if target is None:
            return []
        conversation_id = str(target.get("conversation_id") or run_id)
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT r.*, p.canonical_path AS project_path
                FROM runs r JOIN projects p ON p.project_id=r.project_id
                WHERE r.conversation_id=?
                ORDER BY r.turn_index ASC, r.created_at ASC
                """,
                (conversation_id,),
            ).fetchall()
        return [_run_row(row) for row in rows]

    def list_resource_samples(
        self,
        project_id: str,
        mode: str,
        *,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT steps, model_calls, tool_calls, input_tokens, output_tokens,
                       created_at, completed_at
                FROM runs
                WHERE project_id=? AND mode=?
                  AND status IN ('completed', 'failed', 'cancelled', 'interrupted')
                  AND model_calls > 0
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (project_id, mode, max(1, min(limit, 100))),
            ).fetchall()
        return [
            {
                "steps": int(row["steps"]),
                "model_calls": int(row["model_calls"]),
                "tool_calls": int(row["tool_calls"]),
                "input_tokens": int(row["input_tokens"]),
                "output_tokens": int(row["output_tokens"]),
                "created_at": row["created_at"],
                "completed_at": row["completed_at"],
            }
            for row in rows
        ]

    def set_archived(self, run_id: str, archived: bool) -> bool:
        with self._transaction() as connection:
            cursor = connection.execute(
                "UPDATE runs SET archived=?, updated_at=? WHERE run_id=?",
                (int(archived), _now(), run_id),
            )
            return cursor.rowcount > 0

    def delete_run(self, run_id: str) -> bool:
        with self._transaction() as connection:
            cursor = connection.execute("DELETE FROM runs WHERE run_id=?", (run_id,))
            return cursor.rowcount > 0

    def _configure(self) -> None:
        with self._lock:
            self._connection.execute("PRAGMA foreign_keys=ON")
            self._connection.execute("PRAGMA busy_timeout=3000")
            if self.path != ":memory:":
                self._connection.execute("PRAGMA journal_mode=WAL")

    def _migrate(self) -> None:
        with self._transaction() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects(
                    project_id TEXT PRIMARY KEY,
                    canonical_path TEXT NOT NULL UNIQUE,
                    profile_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS runs(
                    run_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(project_id),
                    conversation_id TEXT NOT NULL,
                    parent_run_id TEXT,
                    turn_index INTEGER NOT NULL DEFAULT 0,
                    task TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    status TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT,
                    termination_reason TEXT NOT NULL DEFAULT '',
                    final_message TEXT NOT NULL DEFAULT '',
                    budget_json TEXT NOT NULL DEFAULT '{}',
                    changed_files_json TEXT NOT NULL DEFAULT '[]',
                    applied_patches INTEGER NOT NULL DEFAULT 0,
                    repair_attempts INTEGER NOT NULL DEFAULT 0,
                    steps INTEGER NOT NULL DEFAULT 0,
                    model_calls INTEGER NOT NULL DEFAULT 0,
                    tool_calls INTEGER NOT NULL DEFAULT 0,
                    input_tokens INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0,
                    total_tokens INTEGER NOT NULL DEFAULT 0,
                    test_status TEXT NOT NULL DEFAULT 'Not run',
                    report_path TEXT NOT NULL,
                    trace_path TEXT NOT NULL,
                    patch_path TEXT NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0,
                    completion_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_runs_project_updated ON runs(project_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_status_updated ON runs(status, updated_at DESC);
                """
            )
            columns = {
                row[1]
                for row in connection.execute("PRAGMA table_info(runs)").fetchall()
            }
            if "completion_json" not in columns:
                connection.execute("ALTER TABLE runs ADD COLUMN completion_json TEXT NOT NULL DEFAULT '{}'")
            if "conversation_id" not in columns:
                connection.execute("ALTER TABLE runs ADD COLUMN conversation_id TEXT NOT NULL DEFAULT ''")
            if "parent_run_id" not in columns:
                connection.execute("ALTER TABLE runs ADD COLUMN parent_run_id TEXT")
            if "turn_index" not in columns:
                connection.execute("ALTER TABLE runs ADD COLUMN turn_index INTEGER NOT NULL DEFAULT 0")
            connection.execute("UPDATE runs SET conversation_id=run_id WHERE conversation_id='' OR conversation_id IS NULL")
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_runs_conversation_turn ON runs(conversation_id, turn_index ASC)"
            )

    def _transaction(self):
        return _Transaction(self)


class _Transaction:
    def __init__(self, store: HistoryStore) -> None:
        self.store = store

    def __enter__(self) -> sqlite3.Connection:
        self.store._lock.acquire()
        return self.store._connection

    def __exit__(self, exc_type, exc, traceback) -> None:
        try:
            if exc_type is None:
                self.store._connection.commit()
            else:
                self.store._connection.rollback()
        finally:
            self.store._lock.release()


def _run_values(
    run: RunState,
    *,
    result: RunLoopResult | None = None,
    artifacts: RunArtifacts | None = None,
) -> dict[str, Any]:
    budget = run.budget
    token_usage = result.token_usage if result is not None else {}
    return {
        "budget_json": _json(budget),
        "changed_files_json": _json(run.changed_files),
        "steps": result.steps if result is not None else run.current_step,
        "model_calls": result.model_calls if result is not None else int(budget.get("model_calls", 0)),
        "tool_calls": result.tool_calls if result is not None else int(budget.get("tool_calls", 0)),
        "input_tokens": int(token_usage.get("input_tokens", budget.get("input_tokens", 0))),
        "output_tokens": int(token_usage.get("output_tokens", budget.get("output_tokens", 0))),
        "total_tokens": int(token_usage.get("total_tokens", budget.get("total_tokens", 0))),
        "test_status": artifacts.test_summary.status if artifacts is not None else (run.test_status or "Not run"),
        "completion_json": _json(result.completion.to_dict()) if result is not None and result.completion is not None else "{}",
    }


def _project_row(row: sqlite3.Row) -> dict[str, Any]:
    keys = set(row.keys())
    return {
        "project_id": row["project_id"],
        "path": row["canonical_path"],
        "profile": _loads(row["profile_json"], {}),
        "created_at": row["created_at"],
        "last_opened_at": row["last_opened_at"],
        "run_count": int(row["run_count"]) if "run_count" in keys else 0,
        "latest_status": row["latest_status"] if "latest_status" in keys else None,
        "latest_run_at": row["latest_run_at"] if "latest_run_at" in keys else None,
    }


def _run_row(row: sqlite3.Row) -> dict[str, Any]:
    keys = set(row.keys())
    return {
        "run_id": row["run_id"],
        "project_id": row["project_id"],
        "conversation_id": row["conversation_id"] if "conversation_id" in keys and row["conversation_id"] else row["run_id"],
        "parent_run_id": row["parent_run_id"] if "parent_run_id" in keys else None,
        "turn_index": int(row["turn_index"]) if "turn_index" in keys else 0,
        "project_path": row["project_path"] if "project_path" in keys else "",
        "task": row["task"],
        "mode": row["mode"],
        "status": row["status"],
        "phase": row["phase"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "completed_at": row["completed_at"],
        "termination_reason": row["termination_reason"],
        "final_message": row["final_message"],
        "budget": _loads(row["budget_json"], {}),
        "changed_files": _loads(row["changed_files_json"], []),
        "applied_patches": int(row["applied_patches"]),
        "repair_attempts": int(row["repair_attempts"]),
        "steps": int(row["steps"]),
        "model_calls": int(row["model_calls"]),
        "tool_calls": int(row["tool_calls"]),
        "input_tokens": int(row["input_tokens"]),
        "output_tokens": int(row["output_tokens"]),
        "total_tokens": int(row["total_tokens"]),
        "test_status": row["test_status"],
        "completion": (_loads(row["completion_json"], {}) or None) if "completion_json" in keys else None,
        "report_path": row["report_path"],
        "trace_path": row["trace_path"],
        "patch_path": row["patch_path"],
        "archived": bool(row["archived"]),
        "project_profile": _loads(row["project_profile_json"], {}) if "project_profile_json" in keys else {},
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _loads(value: str, fallback: Any) -> Any:
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return fallback
