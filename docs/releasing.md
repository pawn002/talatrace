# Release TalaTrace

This is the reusable maintainer procedure. [1.3.0 notes](releases/1.3.0.md) describe the shipped release; the [archived migration record](archive/talatrace-release-migration.md) contains its checkpoint, hashes, upgrade evidence and limitations. Do not replay the completed rename plan for a routine release.

## Scope and version preparation

Windows x64 NSIS/ZIP is the validated release path. [Linux #24](https://github.com/pawn002/talatrace/issues/24) remains open; macOS/Linux scripts need native and installer validation before publication. Signing is not configured for 1.3.0, so identify unsigned artifacts explicitly.

**Experimental Linux exception, approved 29 October 2026:** candidate 5 may proceed to an explicitly labelled Linux-only experimental prerelease with the documented [support status and limitations](linux.md#experimental-support-status). Further personal Linux testing by the maintainer is not required for that prerelease. Preserve #24 as the full-support tracker; do not mark untested acceptance criteria complete. Recommend the x86_64 CPU deb, prominently disclose the AppImage launch-policy failure, identify exact source/package hashes and include the known bugs and untested desktop matrix. Keep the Linux prerelease separate from Latest/stable Windows 1.3.0. Publishing/merging remains a distinct action; the support-status decision alone does not perform either.

Merge reviewed feature work before bumping the final version on main. Confirm a clean working tree, intended revision and previous release tag. Exclude checkpoint tags when finding a release baseline:

```powershell
git status --short
git describe --tags --match 'v[0-9]*' --abbrev=0
```

Prepare curated release notes and move Unreleased changes into the chosen changelog section. Stage a version without a premature commit/tag, then synchronize manifests and lockfile roots. For example, replace 1.2.1 with the intended release:

```powershell
npm version 1.2.1 --no-git-tag-version
npm run version:sync
```

Alternatively, `npm run version:patch`, `npm run version:minor` or `npm run version:major` prepares synchronized versions on main without creating a commit or tag. Verify root/frontend manifests and both lockfiles agree before committing/tagging. Version synchronization parses all target files before writing, so malformed metadata fails before changing versions.

Run the optional wizard through `npm run release:interactive`. It enforces main and discovers artifacts recursively while excluding unpacked runtimes, backups and other versions. Duplicate artifact basenames fail rather than selecting one silently. Set `TALATRACE_ARTIFACTS_DIR` to use a custom build/discovery directory. The wizard creates a draft and uploads assets; verify uploaded hashes before publishing it manually.

## Build environment

Check all native resources listed in `package.json`: Whisper CPU/Vulkan executables and DLLs, VAD helper/Silero weights, FFmpeg, and pinned Parakeet runtime/version/notices. See [Development](development.md) for paths. A host-tuned native build is not evidence of portability to other CPUs.

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm test
npm run dist:win -- --publish never
```

Use an explicit output directory if preserving old artifacts. `release/` is disposable and ignored; `.local-backups/` is ignored recovery storage and must never be packaged.

Windows builds do not universally require administrator privileges. A known electron-builder cache failure tries to preserve unused macOS `.dylib` symlinks. Use a symlink-capable build environment or a correctly prepared local tool cache. The 1.2.0 host extracted the downloaded tool archive without preserving those macOS symlinks, then set `ELECTRON_BUILDER_CACHE` to the prepared `release/build-tools` directory. Setting that variable to an empty directory alone does not fix extraction. Keep executable icon/version resource editing enabled; do not skip it silently to bypass the tool-cache issue.

## Validate

- Run appropriate unit/native checks and AGENTS.md's rendered checks for UI changes. Distinguish fixture previews from real inference.
- Run `node tests/electron/packaged-release-smoke.cjs <path-to-exe>` against the actual Windows package. The test host needs local Base/Parakeet weights and the reference sample. It isolates appData before startup, blocks HTTP(S) for recognition, and checks legacy retention, restart preferences and clean-profile launch. It does not install the app.
- Prefer a disposable system for installer checks. When deliberately using a real system, first close/save the app, independently back up the full profile and prior installer, verify copied model hashes and preserve original shortcut/registry evidence. Never force-close an active recording to install.
- Check upgrade identity, one Installed Apps entry, shortcut targets, retained models/preferences, actual offline inference and final installed version. The smoke helper's explicit `--real-profile` mode requires `.local-backups/active-upgrade-backup.txt`; it deliberately uses a backed-up real profile.
- Record fresh installation, upgrade, uninstall and rollback separately. A clean-profile EXE launch is not a clean NSIS installation. For 1.2.0, upgrade passed; fresh NSIS installation/uninstall/rollback remain untested.

## Publish

Commit the synchronized version, changelog, canonical metadata and release notes. Tag the tested revision, push the tag, and create a draft release while uploading artifacts. Use explicit files for the chosen version, not wildcards that might include old installers or recovery files.

Use download-friendly filenames and an ASCII/UTF-8, LF `SHA256SUMS.txt` naming the exact uploaded files. Compare uploaded sizes and GitHub's server-reported SHA-256 digests against local files before publishing. Mark the verified release Latest, then check unauthenticated downloads, the public manifest and `/releases/latest`.

The repository is `pawn002/talatrace`. Old blog/repository URLs redirect, and the README retains the old `#-quick-start` anchor. Never recreate `pawn002/whisper-electron-app`, which would break redirects. Keep the internal package name, app ID and profile identity stable unless doing a separate tested migration.

Record release evidence and honest limitations in dated notes. Do not infer accessibility certification, other OS support or a safe downgrade from unit tests and sampled visual checks.
