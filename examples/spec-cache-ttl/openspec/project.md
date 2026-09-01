# Project

This project contains a dependency-free in-memory cache used by small Python services.

Constraints:

- Preserve the existing `SimpleCache.set`, `get`, `delete`, and `clear_expired` names.
- Keep no-TTL entries alive until explicit deletion.
- Expired entries must not be returned by `get`.
- Use the injected `now` clock for deterministic tests.
