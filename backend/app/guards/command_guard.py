from __future__ import annotations

import shlex


class DangerousCommand(PermissionError):
    pass


BLOCKED_TOKENS = {
    "rm",
    "sudo",
    "chmod",
    "chown",
    "mkfs",
    "dd",
    "shutdown",
    "reboot",
    "curl",
    "wget",
    "ssh",
    "scp",
}

BLOCKED_OPERATORS = {";", "&&", "||", "|", ">", ">>", "<", "`"}


def check_command(command: str, allowed_prefixes: list[str] | None = None) -> list[str]:
    tokens = shlex.split(command)
    if not tokens:
        raise DangerousCommand("Command must not be empty")

    if any(operator in command for operator in BLOCKED_OPERATORS):
        raise DangerousCommand("Command contains a blocked shell operator")

    if tokens[0] in BLOCKED_TOKENS:
        raise DangerousCommand(f"Command is blocked: {tokens[0]}")

    if allowed_prefixes and tokens[0] not in allowed_prefixes:
        raise DangerousCommand(f"Command is not in allowed prefixes: {tokens[0]}")

    return tokens

