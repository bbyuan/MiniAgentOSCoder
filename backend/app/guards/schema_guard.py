from __future__ import annotations

from typing import Any


class SchemaViolation(ValueError):
    pass


def check_required_params(params: dict[str, Any], schema: dict[str, Any]) -> None:
    for name, expected in schema.items():
        if name not in params:
            raise SchemaViolation(f"Missing required parameter: {name}")
        if expected == "string" and not isinstance(params[name], str):
            raise SchemaViolation(f"Parameter {name} must be a string")
        if expected == "object" and not isinstance(params[name], dict):
            raise SchemaViolation(f"Parameter {name} must be an object")

