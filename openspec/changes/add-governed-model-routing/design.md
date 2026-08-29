# Design: Governed Model Routing

## Backward-Compatible Configuration

The existing `models` mapping remains valid and becomes a synthesized `default` Profile. Optional routing uses:

```yaml
models:
  provider: openai-compatible
  default_model: primary-model
  api_key_env: PRIMARY_API_KEY
  base_url: https://provider.example/v1

  routing:
    enabled: true
    default_profile: primary
    phase_routes:
      inspect: economy
      work: primary
      verify: economy
      repair: primary
    mode_routes:
      Review: economy
    fallback_profiles: [primary]

  profiles:
    primary:
      model: primary-model
      context_window: 128000
    economy:
      model: economy-model
      api_key_env: ECONOMY_API_KEY
      context_window: 64000
```

Profile fields inherit Provider, endpoint, token-field, timeout, JSON-mode, credential environment name, and prices from the root model configuration. A Profile may override those non-secret values. Unknown route targets, duplicate/reserved Profile identifiers, invalid context windows, and malformed routing maps are configuration errors.

## Route Inputs

The route compiler uses only:

- Run mode;
- capability phase: `inspect`, `work`, `verify`, or `repair`;
- selected Context token count;
- explicit phase and mode routes;
- explicit fallback Profile order;
- non-secret Profile readiness and context-window metadata.

Task text, source code, prompts, observations, credentials, and Trace payloads are not routing inputs.

## Deterministic Selection

For each phase, the preferred Profile is selected in this order:

1. exact mode route;
2. exact phase route;
3. configured default Profile.

If the preferred Profile is unavailable or its context window is too small, the compiler checks `fallback_profiles` in declaration order. It never selects an undeclared fallback. A missing feasible candidate produces a blocked route check before model-client construction.

`mode_routes` intentionally override all phases for modes such as Review or Chat. This keeps policy explicit rather than inferring quality from task text.

## Runtime Boundary

The Agent Loop already computes capability phase before each Planner request. It passes that phase as trusted request metadata. The routed client resolves the precompiled Profile, replaces the request model with the selected concrete model, and delegates to that Profile client.

Route selection happens before Prompt Cache lookup. Cache keys include Profile id, model, Provider type, and safe endpoint namespace so two routes cannot share a cached action accidentally.

Trace records:

- `model.route.planned` once before launch;
- `model.route.selected` before each provider request or cache lookup;
- Profile id, model name, phase, selection reason, fallback state, and safe namespace;
- no API key, prompt content, raw Provider response, or credential value.

## Admission And Cost

Model routing contributes deterministic admission checks:

- every phase reachable by the Run has a feasible Profile;
- selected Context fits every selected Profile context window;
- required Profile credentials and endpoint configuration are usable.

The Run remains compatible with one model: its synthesized `default` Profile serves every phase. Optional cost estimates use the planned Profile prices and clearly remain forecasts rather than billing reconciliation.

## Web Experience

Preflight adds one compact route strip under resource admission. It shows the four phases, selected model/Profile, fallback state, and one sentence explaining the policy. Passing phases remain visually quiet; only fallback warnings or blocked phases expand an explanation. Runtime control-plane evidence shows actual per-Profile request and token counts.
