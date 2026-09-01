# Spec Cache TTL

This fixture is designed for Spec mode. It contains an OpenSpec-style change request plus failing tests for a small cache module.

Baseline:

```bash
python3 -m unittest discover -v
```

Expected starting state: TTL tests fail because `SimpleCache` stores values forever.
