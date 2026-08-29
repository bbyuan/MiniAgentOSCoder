# Explain Model Route Preflight

## Why

The Workbench already computes a model route plan, but users need more than the selected model name. A governed coding runtime should explain why a phase uses a Profile, whether fallback is happening, and which active Profiles were checked without exposing credentials.

## What Changes

- Add route-selection reasons to the model route detail panel.
- Show a non-sensitive Profile registry with provider, model, configured state, and context-window state.
- Keep fallback, blocked, and normal route states visually distinct.
- Localize ordinary route explanations in Chinese and English.

## Impact

- Frontend-only change.
- Reuses the existing `/runs/{run_id}/model-route` payload.
- No model credentials or secret values are exposed.
