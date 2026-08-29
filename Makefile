.PHONY: backend-test frontend-build demo benchmark verify

backend-test:
	cd backend && .venv/bin/python -m pytest

frontend-build:
	cd frontend && npm run build

demo:
	cd backend && .venv/bin/python scripts/demo_p0_run.py

benchmark:
	cd backend && .venv/bin/python -m app.evaluation.benchmark --output /tmp/miniagentos-coder-benchmark

verify: backend-test frontend-build demo
