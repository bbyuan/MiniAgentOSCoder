# Cache TTL Specification

## ADDED Requirements

### Requirement: Optional TTL

`SimpleCache.set` MUST accept `ttl_seconds` as an optional number of seconds.

#### Scenario: Value is available before expiration

- GIVEN an item is set with a TTL of 30 seconds
- WHEN 29 seconds have elapsed
- THEN `get` returns the stored value

#### Scenario: Value expires after TTL

- GIVEN an item is set with a TTL of 30 seconds
- WHEN 31 seconds have elapsed
- THEN `get` returns the default value
- AND the expired item is removed

### Requirement: No-TTL Backwards Compatibility

Entries set without `ttl_seconds` MUST remain available until explicit deletion.

### Requirement: Expired Cleanup

`clear_expired` MUST remove expired entries and return the number of removed entries.
