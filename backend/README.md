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

