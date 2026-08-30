# Change: Add Frontend Quality Gates

## Motivation
The Web app is becoming the primary product surface for the demo. It needs repeatable quality checks for localization completeness and build health, and the production bundle should avoid large single chunks that make the app feel less mature.

## Proposal
- Add a dependency-free i18n key parity check for English and Chinese dictionaries.
- Add a frontend `check` script that runs localization validation and the production build.
- Split React, icon, and Tauri bridge code into separate Vite chunks.

## Non-Goals
- Do not add a browser automation dependency in this change.
- Do not package or build the desktop shell in this change.
