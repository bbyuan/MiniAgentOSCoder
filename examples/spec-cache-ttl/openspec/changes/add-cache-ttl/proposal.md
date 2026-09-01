# Add Cache TTL

Add optional time-to-live support to `SimpleCache`.

The existing cache stores values forever. Some callers need temporary entries for sessions, one-time links, and deduplicated background jobs. The implementation should preserve existing no-TTL behavior while allowing per-entry expiration.
