# Contributor agent notes

TalaTrace is an Angular/Electron app with local Whisper and Parakeet engines. Read [AGENTS.md](AGENTS.md) first; it contains the authoritative UI quality and Candor review requirements. Do not replace current Storybook/construction review with a historical screenshot or token-name match.

## Source of truth

- [Documentation index](docs/README.md): current guides versus archived evidence.
- [Development](docs/development.md): actual commands, native paths, tests and setup/harness limitations.
- [Architecture](docs/architecture.md): process/IPC contracts and storage.
- [Candor widget inventory](docs/candor-widget-review.md): current constructions and deliberate adaptations.
- [Releasing](docs/releasing.md): maintainer procedure and supported-platform limits.
- `package.json`, `frontend/package.json`, `electron/main.ts`, `electron/preload.ts` and `electron/services/`: verify instructions against implementation instead of copying API examples into this file.

## Working rules

Use focused branches and preserve user changes. Codex-created branches use `codex/`. Run appropriate checks and report actual outcomes. `npm test` includes frontend and Electron tests; a build/Jest result alone does not establish visual quality, native model behavior, platform support or accessibility conformance.

Keep audio local. Do not run a supposedly isolated harness against a valuable profile without checking startup path assignment. The interview smoke now isolates appData/userData/sessionData and asserts the post-start paths; older revisions did not. See Development. `.local-backups/` is ignored recovery material, not a build artifact. `npm run clean:release` deletes `release/`.

Final version bumps and release sections belong on main after feature work merges. The release wizard enforces main. Avoid npm version shortcuts that create a tag before frontend/lockfile synchronization; use the staged procedure in Releasing. Never rename the internal app ID/profile identity merely to match branding.

## Documentation maintenance

When auditing project documentation, review README, this file, the docs index and all current guides against code, IPC, resource paths, npm scripts, dependencies and release state. Classify dated research/review logs as historical; preserve their evidence without promoting old instructions as current behavior. Update local links when files move. Record findings, changes, validation and unresolved gaps in [AUDIT_REPORT.md](AUDIT_REPORT.md). Do not silently turn unimplemented features or untested platforms into documentation claims.
