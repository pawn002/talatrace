# TalaTrace repository migration and release plan

Recorded: 26 October 2026.

Status: deferred while app iteration continues. This document records the proposed sequence; it does not initiate a repository rename, version bump, tag, push or release.

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
