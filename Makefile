.PHONY: backend-test frontend-build demo verify

backend-test:
	cd backend && .venv/bin/python -m pytest

frontend-build:
	cd frontend && npm run build

demo:
	cd backend && .venv/bin/python scripts/demo_p0_run.py

verify: backend-test frontend-build demo

