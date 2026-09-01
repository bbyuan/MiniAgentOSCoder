# Feature Contact Book

This fixture starts with a small contact import module that is missing the behavior described in `TASK.md`. It is designed for Feature mode.

Baseline:

```bash
python3 -m unittest discover -v
```

Expected starting state: several tests fail because contacts are not merged by normalized email and CSV export is incomplete.
