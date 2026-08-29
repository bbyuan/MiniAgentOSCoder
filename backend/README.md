# MiniAgentOS Coder Backend

Local runtime daemon for MiniAgentOS Coder.

## Development

Install dependencies:

```text
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

Run API:

```text
uvicorn app.main:app --reload
```

Run tests:

```text
python -m pytest
```

## CLI Companion

The FastAPI daemon is also exposed through the `miniagent` CLI companion after installing the backend package:

```bash
miniagent open /path/to/project
miniagent run "/fix repair the failing parser test"
miniagent status RUN_ID
miniagent approval RUN_ID
miniagent approve RUN_ID APPROVAL_ID
miniagent compact RUN_ID --target 0.55
miniagent replay RUN_ID
```

The CLI uses `http://127.0.0.1:8000` by default. Set `MINIAGENTOS_DAEMON_URL` or pass `--url` to target another local daemon.
