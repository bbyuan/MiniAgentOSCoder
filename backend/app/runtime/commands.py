from __future__ import annotations

from dataclasses import dataclass


TASK_COMMANDS = {
    "/fix": "Bugfix",
    "/test": "Bugfix",
    "/review": "Review",
    "/explain": "Chat",
    "/spec": "Spec",
}
SYSTEM_COMMANDS = {"/compact", "/context", "/replay"}


@dataclass(frozen=True, slots=True)
class ParsedCommand:
    kind: str
    command: str | None
    content: str
    mode: str


def parse_command(value: str, default_mode: str = "Bugfix") -> ParsedCommand:
    content = value.strip()
    if not content.startswith("/"):
        return ParsedCommand(kind="task", command=None, content=content, mode=default_mode)
    command, _, remainder = content.partition(" ")
    normalized = command.lower()
    if normalized in TASK_COMMANDS:
        return ParsedCommand(
            kind="task",
            command=normalized,
            content=remainder.strip(),
            mode=TASK_COMMANDS[normalized],
        )
    if normalized in SYSTEM_COMMANDS:
        return ParsedCommand(kind="system", command=normalized, content=remainder.strip(), mode=default_mode)
    return ParsedCommand(kind="task", command=None, content=content, mode=default_mode)
