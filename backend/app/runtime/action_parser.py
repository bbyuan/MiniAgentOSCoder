from __future__ import annotations

import json
from typing import Any

from app.models import ActionIR


class ActionParseError(ValueError):
    pass


def parse_action_ir(raw: str | dict[str, Any]) -> ActionIR:
    if isinstance(raw, str):
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ActionParseError(f"Model response is not valid JSON: {exc.msg}") from exc
    else:
        payload = raw

    if not isinstance(payload, dict):
        raise ActionParseError("Action IR must be a JSON object")

    action_type = payload.get("type")
    rationale = payload.get("rationale")
    params = payload.get("params", {})

    if not isinstance(action_type, str) or not action_type:
        raise ActionParseError("Action IR requires non-empty string field: type")
    if not isinstance(rationale, str) or not rationale:
        raise ActionParseError("Action IR requires non-empty string field: rationale")
    if not isinstance(params, dict):
        raise ActionParseError("Action IR field params must be an object")

    role = payload.get("role", "Orchestrator")
    action_id = payload.get("action_id")

    if not isinstance(role, str) or not role:
        raise ActionParseError("Action IR field role must be a non-empty string")
    if action_id is not None and not isinstance(action_id, str):
        raise ActionParseError("Action IR field action_id must be a string when present")

    return ActionIR(
        type=action_type,
        rationale=rationale,
        params=params,
        role=role,
        action_id=action_id,
    )

