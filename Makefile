.PHONY: backend-test frontend-build frontend-check desktop-check demo example-test benchmark verify

backend-test:
	cd backend && .venv/bin/python -m pytest

frontend-build:
	cd frontend && npm run build

frontend-check:
	cd frontend && npm run check

desktop-check:
	cd frontend && npm run desktop:check

demo:
	cd backend && .venv/bin/python scripts/demo_p0_run.py

example-test:
	cd examples/skill-invoice-rules && python3 -m unittest discover -v

benchmark:
	cd backend && .venv/bin/python -m app.evaluation.benchmark --output /tmp/miniagentos-coder-benchmark

verify: backend-test frontend-check desktop-check example-test demo
