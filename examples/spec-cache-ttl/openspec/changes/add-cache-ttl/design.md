# Design

Store an optional `expires_at` timestamp on each cache entry.

Implementation notes:

- `ttl_seconds=None` means the item never expires.
- `ttl_seconds < 0` should raise `ValueError`.
- `get` should evict and return the default when an entry is expired.
- `clear_expired` should remove expired entries and return the number removed.
- Use the injected clock for all time checks.
