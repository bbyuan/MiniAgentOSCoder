# Design: Model Call Gate

## Decisions

### Exact request identity

The cache key is a SHA-256 digest over a canonical JSON representation of the model name, messages, and request metadata. An exact key match is required; fuzzy semantic caching is intentionally excluded because coding actions must not be reused across materially different context.

### Read-only reuse boundary

Only responses that parse into `list_files`, `read_file`, `search_code`, or `git_diff` are stored. A cache hit reuses the planning decision but still executes the selected tool against the current workspace, so file data itself is never served from cache. Mutating or externally observable actions are always requested from the provider.

### Lifetime and privacy

The cache is process-local, bounded by an LRU entry limit, and expires entries by TTL. It is not written to project files or the history database. Trace events contain the request digest, action type, and counters, never prompt or response content.

### Accounting

`model_calls` remains the number of planning turns for compatibility with the AgentContract budget. `model_cache_hits` counts turns served without a provider request. Provider requests are therefore `model_calls - model_cache_hits`. This keeps scheduling limits conservative while making actual provider savings visible.

## Web presentation

The runtime control plane shows three live facts derived from trace evidence: planning turns, provider requests, and cache hits. The local evaluation summary aggregates cache hits and avoided-provider-call rate across runs.
