# Documentation audit — 26 October 2026

Audited the 24 tracked Markdown documents at `07835cc` (TalaTrace 1.2.0 release/migration complete), plus the scripts/configuration that their claims depend on. This cleanup changes documentation and provenance/legacy-warning comments only; no UI, engine behavior, version or installed user data changes.

## Outcome

The ten rewritten entry-point/guide/inventory files shrink from 3,027 to 499 physical lines (about 84% shorter). Nine completed review/migration documents move to `docs/archive/`, with a full snapshot of the earlier widget log retained there too. No research/evaluation/release evidence is discarded. The [docs index](docs/README.md) now separates four user guides, contributor/maintainer references and historical evidence.

The stable README Quick Start anchors and user-guide filenames remain; `docs/candor-widget-review.md` stays at the path required by AGENTS.md. A reusable [release procedure](docs/releasing.md) replaces using the completed rename checklist as future instructions. Historical main-branch deep links to moved reviews may need their new archive paths; frozen release tags retain the original files.

## Material corrections

| Stale claim / duplication | Current guidance |
| --- | --- |
| Discard recording, editable transcript, Select Audio File / Start Transcription / Export buttons | Actual Record another / Choose another file / Transcribe file / Copy transcript / Save transcript labels; output is read-only |
| Model metadata in badges, old model sizes, universal accuracy tiers and hourly timing estimates | Plain reference columns, implemented catalog sizes and a specifically scoped English evaluation; no universal ranking |
| Default Base on every session | Remember selected model, with documented installed fallback |
| All-platform launches and blanket Windows administrator requirement | Validated Windows x64 release, Linux #24/macOS limits, conditional tool-cache/symlink issue |
| Instant startup, system-info footer, persistent history/editor implications | Asynchronous model discovery, no such footer/editor, completed history capped at 50 for the session |
| 70 frontend tests, minimal future Electron tests, enforced CI/approval and missing format/lint scripts | Dated 1.2.0 baseline of 130 frontend + 42 Electron tests; actual npm commands; no checked-in CI workflow |
| Whisper-only architecture and copied API examples | Both local engines, shared preprocessing, actual IPC/storage contracts and their limits |
| Blanket IPC validation/security/accessibility claims | Specific implemented controls; no claim of a complete security or accessibility audit |
| Recording/file analysis parity, always-timestamped exports | Record-only alignment/pause flags, file-path differences, Copy/TXT preference versus SRT/VTT/JSON behavior |
| Completed migration listed as deferred and obsolete UI iterations mixed with current instructions | Completed work archived with historical banners; current widget table rewritten for the final 1.2.0 construction |
| Four default hardware benchmark variants, old whisper-bins paths and hypothetical speedups | Actual baseline/Vulkan config, current build discovery and raw-benchmark versus service-evaluation limits |

## Unresolved code/tooling findings

These are visible in the code; the docs now disclose them instead of claiming fixes that were not made.

1. **Interview smoke profile isolation (priority).** `tests/electron/interview-smoke.cjs` sets userData, then requires main; `electron/main.ts` assigns userData again from appData. The older command can use the real profile despite historical isolation claims. It was not run during this audit. Use the packaged smoke's pre-start appData isolation, or repair/test the older harness before recommending it for valuable profiles.
2. **Native bootstrap drift.** `setup-whisper.js` uses legacy make/CMake/output assumptions and unpinned setup downloads. `build-whisper.js` writes `native/`, while the app expects the variant layouts. Current guides explicitly verify native paths; a clean-machine bootstrap was not rerun or repaired. A reproducible pinned/checksummed bootstrap needs code work.
3. **Preload typing mismatch.** `selectAudioFile` is declared as Promise of string/null, but its actual handler returns `{path, size}`/null. Architecture documents the actual contract; typing remains to be fixed.
4. **Unused packaged Tiny/Base provisioning.** Package resources contain those files, but legacy migration reads `app.getAppPath()/models`, not packaged resources. The verified clean packaged launch sees an empty library and explicitly downloads models. Docs no longer claim automatic packaged provisioning. Decide whether to remove unused resources or implement/test intentional provisioning.
5. **Release shortcuts/helper drift.** The npm version shortcuts create a commit/tag before frontend synchronization; use `--no-git-tag-version` and synchronize before tagging. The wizard still has a blanket Windows admin prompt and a top-level artifact search. The new guide explains the manual validation/custom-output path; helper behavior is unchanged.
6. **Legacy container configurations.** Root Dockerfile/compose still reference a removed backend, Node 18 and HTTP services. They are not current desktop/container support. Added explicit legacy comments, without pretending to repair or validate a container workflow.

Recording/file metadata differences are documented current behavior, not silently changed by this audit. Linux delivery, fresh NSIS installation, uninstall/rollback, the 240px effective-width navigation gap and manual accessibility/screen-reader review remain outside this documentation cleanup.

## File inventory and disposition

| Original / current file | Audit action |
| --- | --- |
| [README.md](README.md) | Short product/download front door; preserve old blog anchor; link native setup rather than duplicate stale bootstrap claims |
| [AGENTS.md](AGENTS.md) | Read and retained unchanged |
| [CLAUDE.md](CLAUDE.md) | Replace duplicated implementation/API/command lists with canonical references and maintained working/release/audit rules |
| [CHANGELOG.md](CHANGELOG.md) | Historical release entries retained; no feature-branch release/version change |
| [benchmarks/README.md](benchmarks/README.md) | Rewrite around actual config/tool semantics and current evaluation |
| [docs index](docs/README.md) | Clear user/contributor/archive navigation |
| [Installation](docs/installation.md) | Packaged Windows first; real upgrades/profile/removal limits; source setup delegated |
| [Usage](docs/usage.md) | Rewrite from actual templates and handlers; remove invented features and duplicate rankings |
| [Development](docs/development.md) | Real npm/native paths, runtime setup gaps, actual tests and safe harness guidance |
| [Architecture](docs/architecture.md) | Short process diagram, actual services/IPC/persistence/resources; remove pseudo-code drift |
| [Models](docs/models.md) | Fix badges/evaluation/default/translation claims, link measured evidence and canonical developer instructions |
| [Troubleshooting](docs/troubleshooting.md) | Current failure states and recovery; remove blanket antivirus/ownership/admin advice and nonexistent footer/DevTools guarantees |
| [Candor inventory](docs/candor-widget-review.md) | Current final-state inventory/adaptations; original long log retained in archive |
| [Speech evaluation protocol](docs/speech-model-evaluation.md) | Checked against runner/preparation code; retained as current specialized procedure |
| [1.2.0 release notes](docs/releases/1.2.0.md) | Retained as released-version evidence; not rewritten into current setup documentation |
| [Prior-art review](docs/archive/prior-art-review.md) | Archive with historical notice |
| [Model research](docs/archive/transcription-model-review.md) | Archive with historical notice |
| [Dated evaluation](docs/archive/speech-model-evaluation-2026-10-25.md) | Archive; update live provenance link/comment |
| [Candor migration](docs/archive/candor-migration-review.md) | Archive with historical notice |
| [Disabled-state review](docs/archive/candor-disabled-state-review.md) | Archive with historical notice and harness caveat |
| [Icon review](docs/archive/candor-icon-review.md) | Archive with historical notice |
| [Typography review](docs/archive/typography-review.md) | Archive with historical notice |
| [Visual review](docs/archive/visual-review.md) | Archive with historical notice |
| [Repository/release migration](docs/archive/talatrace-release-migration.md) | Archive completed history; future work uses Releasing |

New organizational files are this report, [Releasing](docs/releasing.md), [archive index](docs/archive/README.md) and the [complete earlier widget-log snapshot](docs/archive/candor-widget-review-2026-10.md). Internal relative links are rebased for moved files. The only production-source change is the benchmark's documentation provenance comment; Docker/compose changes are comments.

## Verification and limits

Checked 157 repository-local Markdown file/heading destinations across all 28 resulting documents, 40 active npm-script mentions against package.json, all nine IPC request names and the five supported event names against main/preload, and version agreement across manifests/lockfiles. No broken checked links/anchors or missing mentioned npm scripts remain. Native path/feature statements were compared with code. Compared all ten archived records against HEAD: only historical notices and rebased links differ. Current guides were read again after reorganization; `git diff --check` passes. AGENTS.md, package manifests, lockfiles and application behavior are unchanged.

Application tests and visual previews were not rerun: no executable application behavior changed. The 172-test / 126-state figures are explicitly attributed to the prior 1.2.0 validation, not claimed as new audit runs. Historical external vendor/model research was not freshly revalidated, and not every incoming external main-branch deep link can be discovered from the repo. Fresh native setup, unsupported platforms and the documented tooling defects remain untested/unfixed here.
