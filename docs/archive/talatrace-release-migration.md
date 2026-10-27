# TalaTrace repository migration and release plan

> Historical record from October 2026. Earlier findings, commands and verification claims may be superseded. Use the [current documentation index](../README.md), [current widget inventory](../candor-widget-review.md) and [documentation audit](../../AUDIT_REPORT.md) for present behavior and known test-harness limits.

Recorded: 26 October 2026.

Status: complete. PR #23 merged, the existing repository renamed to `pawn002/talatrace`, and 1.2.0 published as Latest on 26 October 2026 (27 October UTC). Checkpoint, upgrade evidence and remaining test limits are retained below.

## Recommended approach

Rename the existing GitHub repository from `pawn002/whisper-electron-app` to `pawn002/talatrace`, rather than creating a separate repository. This keeps the existing project history, issues, releases and community together under the new app name.

An existing blog post links to the current repository. GitHub redirects old repository web URLs and Git clone/fetch/push operations following a rename. Existing local clones should nevertheless update their remotes. **Never recreate a repository at `pawn002/whisper-electron-app` after the rename:** reusing the old name disables its redirects.

GitHub Pages project URLs do not receive the same automatic redirects. Calls to an action hosted by a renamed repository also do not redirect. Before proceeding, check for either dependency and recheck GitHub's current behavior. Source: [GitHub repository rename guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository), reviewed 26 October 2026.

## Sequence when the app is ready

1. **Checkpoint the app.** Review and commit pending work, run the relevant checks, and tag the tested state before release preparation. Choose the tag at that time.
2. **Prepare locally.** Audit canonical repository links, package metadata, release scripts, badges and any publishing/update configuration for the new repository address. Preserve historical changelog references where appropriate. Do not change the installer app ID or legacy data directories as part of the branding change.
3. **Test packaged upgrade behavior.** Install the candidate over the previous release and verify downloaded models, preferences, any persisted history, shortcuts, launch behavior and uninstall identity. Check for duplicate installations. Test both an upgrade and a clean install on supported release targets; record any untested platforms. Development-mode tests do not establish installer compatibility.
4. **Rename the existing repository.** Use `pawn002/talatrace`, update its description and canonical links, and update local remotes to `https://github.com/pawn002/talatrace.git`. Check name availability and repository permissions immediately before execution. The local checkout folder can retain its current name.
5. **Verify continuity.** Check the exact URL linked from the blog, an existing issue, a release page, direct release-asset downloads, and cloning through the old URL. Confirm that links reach the intended project and assets. Review integrations and any release/update endpoints rather than assuming all consumers follow redirects.
6. **Publish the release.** Introduce it as “TalaTrace, formerly Whisper Transcription.” Explain the expanded engine support and continuity of local data. Publish verified artifacts and release notes, then optionally add a short update and canonical link to the blog post.

## Version and compatibility

The proposed next version is **1.2.0**, reflecting the expanded model support and recording workflow. This is tentative until release scope is settled; the rename alone does not require a major version. Follow the repository's release process and synchronize version metadata and lockfiles at release time, rather than bumping versions during ongoing feature work.

The app's display name is already TalaTrace. Internal package identifiers and the existing installer app ID deliberately remain stable. Startup retains legacy profile directories. Keep that compatibility behavior through this release; any future identifier or storage migration should be a separate, tested change.

## Outstanding checks

- Release 1.2.0 is published; the test limitations below remain documented follow-up work.
- Windows in-place upgrade is verified below. Fresh NSIS installation, uninstall and rollback remain untested; clean-profile packaged launch passes.
- Post-rename redirects are verified below. A README compatibility anchor restores the original Quick Start fragment; modernizing the blog's link is optional.
- Reassess release tooling, integrations and platform coverage at execution time.
- Repository rename, final validation and publication are complete.

## Preparation results — 26 October 2026

- Tested app checkpoint: commit `4ac30ed`, tag `checkpoint/before-talatrace-release-2026-10-26`. All 130 frontend and 40 Electron tests passed at that checkpoint. The latest workflow visual review passes 126 states with the documented extreme-zoom navigation gap.
- GitHub audit: current repository is public, its default branch is main, the connected account has admin permission, and Pages is disabled. No `.github` workflow or hosted action is present in this checkout. The target repository URL returned 404 when checked; recheck immediately before renaming. GitHub's current rename guidance still confirms repository and Git redirects, excluding Pages/action references.
- Release tooling now synchronizes package manifests and both root lockfile metadata fields without changing dependency versions; preserves curated Unreleased notes when making a release section; excludes checkpoint tags from previous-release discovery; includes lockfiles in the release commit and rollback; and requires main for the release wizard. Two new regression tests pass (42 Electron/release-tooling tests total).
- Per the repository's release policy, the feature branch's package versions remain unchanged. Root package-lock.json's pre-existing 1.2.0 mismatch will be resolved by version synchronization on main. Local packaging uses an `extraMetadata.version=1.2.0-rc.1` override and `--publish never`.
- Windows x64 candidate built in `release/talatrace-rc1/`: `TalaTrace Setup 1.2.0-rc.1.exe` and `TalaTrace-1.2.0-rc.1-win.zip`. Both are unsigned. Windows resource editing remains enabled. A workspace-local electron-builder tool cache, extracted from the already-downloaded tool archive without preserving macOS symlinks, avoids this host's symlink-privilege failure. No administrator terminal was needed for this candidate.
- Installer SHA-256: `EE307F2465B8190A84CB0D4E94125CF0AF52AEA0E01A08BF62A73A4A3D4BAF70`.
- ZIP SHA-256: `DBDB1FFC4D34790D834B6C74E9BFFD24260562F2FC345010B17C4E05FEA8A2D4`.
- `node tests/electron/packaged-release-smoke.cjs` tests the actual packaged EXE. A debugger isolates appData before application code executes, with no production test hook. Both Whisper Base and Parakeet recognize the bundled reference sample with HTTP(S) blocked, returning duration/processing/timing data. A temporary legacy profile and marker survive, model selection persists over restart, and a clean profile launches. Temporary test profiles are retained for inspection. This does not install the app or validate NSIS upgrade behavior.
- Static installer-identity review: the app ID remains `com.yourcompany.whisper-electron`, as in 1.1.5; electron-builder derives its NSIS GUID from that ID. Product/executable names change. This supports continuity but does not substitute for an installed upgrade test.
- Release notes: [1.2.0](../releases/1.2.0.md).

The initial plan called for a disposable Windows machine/VM, but the user only has this system and confirmed that 1.1.5 is installed. A native-context registry check found the installation (the earlier sandbox-limited check did not expose it). The in-place upgrade results are recorded below. The exact blog destinations are recorded for post-rename verification. Repository rename and public release remain pending review of these results and remaining limitations.

## Installed Windows upgrade — 26 October 2026

- Located the per-user 1.1.5 installation at `%LOCALAPPDATA%\Programs\whisper-electron-app`, using uninstall key `72457f39-6610-52b7-a891-b0bdbbb40dac`. No application process was running.
- Before installation, independently copied the complete profile (93 files, approximately 4.2 GiB), including Local Storage and models, to the ignored local directory `release/upgrade-backup-20261026-195532/profile`. All four copied model files were verified against their originals by SHA-256. Saved the old uninstall entry, shortcut targets and model hash manifest beside the backup. The 1.1.5 installer remains available locally and on GitHub.
- Rechecked the candidate installer hash and performed the NSIS in-place upgrade (`/S`); exit code 0. Installed Apps now reports `TalaTrace 1.2.0-rc.1` under the same single uninstall key and installation folder. Both Desktop and Start Menu links are renamed TalaTrace and target the existing `TalaTrace.exe`; old Whisper Transcription links are absent from those locations.
- Before launching, verified that all four installed model hashes are unchanged and all six backed-up Local Storage files match byte-for-byte. Tiny, Large v3, Large v3 Turbo and Parakeet remain discoverable in the actual installed app.
- The explicit `--real-profile` mode of the packaged smoke helper, guarded by the backup manifest, launches the installed executable with its real Roaming profile. HTTP(S) is blocked during the test. Tiny and Parakeet both transcribe the bundled JFK sample and return timing/duration metadata; saved model selection remains Parakeet. No test preference is substituted. Inspected the installed Models screenshot with the image viewer.
- Installed upgrade smoke passes; the candidate remains installed. Screenshot, before/after manifests and backup are local ignored artifacts, not included in the PR. No real user audio was transcribed for this test.
- Fresh NSIS installation, uninstall and rollback have not been exercised. The user's installed app was left intact rather than removed for an uninstall test. Windows Sandbox remains unavailable. Keep this limitation in the release decision; do not describe the packaged clean-profile launch as a clean installer test.

Recovery material: retain `release/upgrade-backup-20261026-195532/` and `release/Whisper Transcription Setup 1.1.5.exe` until the release is accepted. If recovery becomes necessary, close the app first and use the prior installer and profile backup; any downgrade/uninstall sequence must preserve the data backup and be verified separately. The exported registry entry is diagnostic evidence, not an instruction to import it over a live installation.

## Exact blog-link baseline

User-supplied post: [Building a Privacy-First Transcription Tool with Claude Code](https://pawn002.github.io/blog-public/blog/building_whisper_transcription_app/). Fetched the live HTML on 26 October 2026. It contains four distinct links into this repository, with the repository root repeated in several places. All four return HTTP 200 before migration.

| Current destination suffix under `https://github.com/pawn002/whisper-electron-app` | Blog role | Post-rename check |
| --- | --- | --- |
| (repository root) | App / GitHub links | Redirect reaches `pawn002/talatrace`. |
| `/tree/main#-quick-start` | Getting started | Redirect reaches main; the existing fragment also needs correction (see below). |
| `/blob/main/docs/architecture.md` | Architecture documentation | Redirect reaches the same document in `talatrace`. |
| `/tree/main/docs` | Documentation directory | Redirect reaches the same directory in `talatrace`. |

The Getting started link already has a stale `#-quick-start` fragment: the live README exposes `#quick-start` (`id="user-content-quick-start"`). HTTP 200 does not establish that a fragment scrolls correctly. When the blog is updated for TalaTrace, use `https://github.com/pawn002/talatrace#quick-start` and verify that heading navigation as well as the repository redirect. This is a pre-existing blog-link issue, not an effect of the rename. No blog content has been edited.

## Repository migration completed

PR #23 merged as `2ec8e04d56389a92179c878e5f815d5245526084`. Renamed the existing repository to [pawn002/talatrace](https://github.com/pawn002/talatrace), retained its issues/releases/history, updated origin and fast-forwarded local main. Updated current canonical documentation and package repository metadata; historical release references remain intact. Internal package name and app ID are unchanged.

All four exact old blog destinations, issue #16 and release v1.1.5 return HTTP 200 after following redirects to TalaTrace. The old direct 1.1.5 installer URL still reaches its release asset with HTTP 200. `git ls-remote` through the old repository URL returns the merged main revision. The README adds a compatibility anchor for the post's original `#-quick-start` fragment, so the blog itself need not be edited for continuity. Never recreate `pawn002/whisper-electron-app`.

Final 1.2.0 manifests and lockfile metadata are synchronized on main. The complete 130 frontend / 42 Electron test suite passes. Final artifact checks and publication follow below when complete.

## Final 1.2.0 validation

Built unsigned Windows x64 artifacts from main with synchronized 1.2.0 metadata and canonical repository links. The packaged application contains the expected 1.2.0 metadata and no profile backups or other private test artifacts. Final packaged offline Whisper Base/Parakeet, legacy-profile retention, preference restart and clean-profile launch tests pass.

After the user closed the RC, backed up the current settings and installed final 1.2.0 over RC1 (exit code 0). All four model hashes remain unchanged. The installed app reports 1.2.0, uses the original profile, and Tiny/Parakeet recognize the reference sample with HTTP(S) blocked. Existing Parakeet preference is retained. Fresh NSIS installation, uninstall and rollback remain untested; only the described upgrade paths are verified.

Moved the recovery directory to the ignored `.local-backups/upgrade-backup-20261026-195532/` so `npm run clean:release` cannot remove it. Its profile copy, model hashes, registry/shortcut evidence, pre-final settings snapshot and screenshot are retained. `.local-backups/active-upgrade-backup.txt` identifies this directory for explicit installed-profile smoke tests. Earlier `release/upgrade-backup-...` paths above record its original location; use `.local-backups/` for recovery now.

| Final asset | SHA-256 |
| --- | --- |
| `TalaTrace-Setup-1.2.0.exe` | `9391ae53e920550ae5eabbeda7f2ff51a09f713ad4e4a8d111b2ae18ed818e64` |
| `TalaTrace-1.2.0-win.zip` | `024ac48b495e9b54d2820e53dfee4c490ecdd7bc5bb959672affce189fa4e0d7` |

Published [v1.2.0](https://github.com/pawn002/talatrace/releases/tag/v1.2.0) as Latest from tag `v1.2.0` at `1098184d120803cc36696831fb4aef3e4c6d2641`. Both Windows artifacts and the portable LF `SHA256SUMS.txt` are uploaded. GitHub's server-reported SHA-256 digests and sizes match every local artifact. The checksum manifest's own SHA-256 is `59bd4d769de625a6f49cceb7ec00c6e703301dc8d5608e38adfedccb02b5e994`.

Unauthenticated public checks pass: both old/new repository `/releases/latest` URLs reach v1.2.0, installer/ZIP downloads return HTTP 200, and the downloaded public checksum manifest matches the local copy. The current system has final 1.2.0 installed. The protected backup also contains a checksum-verified `Whisper-Transcription-Setup-1.1.5.exe` for offline recovery; rollback itself remains untested. Preserve the old repository redirects and previous release, and never reuse the old repository name.
