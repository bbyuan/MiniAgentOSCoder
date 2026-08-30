.PHONY: backend-test frontend-build frontend-check demo benchmark verify

backend-test:
	cd backend && .venv/bin/python -m pytest

frontend-build:
	cd frontend && npm run build

frontend-check:
	cd frontend && npm run check

demo:
	cd backend && .venv/bin/python scripts/demo_p0_run.py

benchmark:
	cd backend && .venv/bin/python -m app.evaluation.benchmark --output /tmp/miniagentos-coder-benchmark

verify: backend-test frontend-check demo
