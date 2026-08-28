from __future__ import annotations

import os

import uvicorn

from app.main import app


def daemon_port() -> int:
    raw = os.environ.get("MINIAGENTOS_PORT", "8000")
    try:
        port = int(raw)
    except ValueError as exc:
        raise RuntimeError("MINIAGENTOS_PORT must be an integer") from exc
    if not 1 <= port <= 65535:
        raise RuntimeError("MINIAGENTOS_PORT must be between 1 and 65535")
    return port


def main() -> None:
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=daemon_port(),
        log_level=os.environ.get("MINIAGENTOS_LOG_LEVEL", "info"),
        access_log=False,
    )


if __name__ == "__main__":
    main()
