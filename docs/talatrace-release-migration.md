# TalaTrace repository migration and release plan

Recorded: 26 October 2026.

Status: release preparation started on 26 October 2026. The local checkpoint and candidate below are complete; repository rename, merge, final version bump/tag and publication remain pending.

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

- App iteration and release readiness are not complete.
- Packaged clean-install and upgrade checks remain to be performed.
- Capture the exact blog destination before validating redirects; it has not been supplied in this plan.
- Reassess release tooling, integrations and platform coverage at execution time.
- No remote repository rename or release has been performed by recording this plan.

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
- Reviewable release notes: [1.2.0 draft](releases/1.2.0-draft.md).

Next gate: test clean install and 1.1.5 → candidate upgrade on a disposable Windows machine/VM, checking the executable and shortcuts, one uninstall entry, downloaded weights, preferences and uninstall/rollback behavior. Windows Sandbox is unavailable on this host; no existing Whisper/TalaTrace per-user uninstall entry was found. The real installed-user workflow has not been exercised. The exact blog URL is requested so its actual destination can be checked after rename. Repository rename and public release wait for these checks.
