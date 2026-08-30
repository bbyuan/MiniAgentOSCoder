# Add Model Configuration Console

## Why

Model readiness was visible, but the Workbench did not explain the active non-sensitive configuration behind that readiness. Users need to see which config file is active, whether routing is single-model or phase-aware, which Profiles are configured, and which routes are declared before they trust the runtime.

## What Changes

- Add a non-sensitive `/models/config` Daemon endpoint.
- Show model configuration source, routing mode, default Profile, fallback count, active Profiles, and declared phase routes in the model setup dialog.
- Keep API keys secret by returning only environment variable names and sanitized endpoints.
- Add backend coverage for routed Profile snapshots.

## Impact

- Adds one read-only Daemon API.
- Frontend model dialog becomes a model configuration console.
- No credential values are returned or stored in the browser.
