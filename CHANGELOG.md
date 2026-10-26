# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open transcription settings in a Candor modal from the workflow card footer, beside the timing option.
- Delete downloaded models from Models to reclaim disk space, with protection against deletion during transcription or an active download.
- Remember the last selected model between sessions and select an available fallback if it is removed.
- Sort History by file, model, status, audio duration, processing time or date, with keyboard controls and numeric comparisons.

### Changed
- Show Parakeet engine diagnostics and transcription start, completion timing and failures in the terminal, keeping transcript JSON separate from logging.
- Apply Candor's theme-aware native scrollbar construction to the page, transcript and table scroll areas, with a 6px visible bar inside a 24px grab area.
- Simplify the transcript header, move technical metadata into a collapsed Transcript details footer and quiet the timestamp gutter while preserving visible warnings and copied timing precision.
- Replace the scrolling recording spectrogram with live frequency bars matching the idle illustration, and reduce the placeholder bars and label to the same near-minimum contrast in both themes.
- Rename **Whisper Transcription** to **TalaTrace** across the app header, window title, packaged application and documentation. The model-neutral name reflects support for both Whisper and Parakeet, while retaining private, on-device transcription and timing context.
- Preserve the existing application data directory and installer identity through the rename so downloaded models, history and preferences remain available.
- Replace the divider above recording feedback and selected-file metadata with more spacing, and align History's Copy actions with Models' ghost button style.
- Keep an empty model library after deletion instead of automatically downloading Tiny on startup.
- Show a static, themed audio-spectrum placeholder before recording, remove the hint beneath the workflow switcher and the empty file choice's icon, and display model reference measurements as plain values.

### Fixed
- Discover installed models without checksum-scanning every model at startup or during catalog refreshes. Keep full integrity verification on download and before recognition, and distinguish pending or failed discovery from an empty installation so startup does not incorrectly prompt a download.

## [1.1.5] - 2026-05-02

### Added
- Switch Windows dist target to nsis + zip, drop admin requirement
- Remove default Electron toolbar, use native overlay controls
- Upgrade Candor to v3.0.0 and align CTAs to navy primary

### Fixed
- Pre-release polish (#19)
- Correct toast dismiss icon weight to ph-fill
- Restore Windows admin check before distribution build
- Make release script atomic — rollback on failure before commit
- Stop auto-opening DevTools on dev launch
- Remove application menu template that was overriding setApplicationMenu(null)
- Compile electron TypeScript before launching in dev mode
- Remove default app menu, restore standard title bar

## [1.1.4] - 2026-04-08

### Added
- docs(claude): add release process rule — no version bumps on feature branches
- fix: address low-priority audit items
- feat: add SVG logo mark to app header with baseline alignment
- feat: add waveform+nib app icon
- style: refine Phosphor icon weights and add button--accent
- feat: replace Material Icons with Phosphor light weight icons
- feat: render transcript segments with humanist typography
- perf: add Vulkan iGPU backend — 1.7–4x speedup on Intel Iris Xe
- test: add IPC callback tests for ngOnInit event registrations
- Add initial test suite (28 tests, 0 → 28 coverage)
- Add Candor issue drafts for later action

### Changed
- revert: undo premature version bump and CHANGELOG entry
- chore: bump version to 1.2.0, update CHANGELOG, fix spec for refactored component
- docs: audit and update all documentation for current codebase state
- docs: update CONTINUATION-GUIDE — mark all work complete, rule out SYCL
- docs: update CONTINUATION-GUIDE with current session state
- chore: update whisper.cpp to v1.8.4

### Fixed
- fix: changelog uses current version as baseline, handle stale tags on re-run
- fix: build before commit in release script, handle Windows admin for dist
- fix: correct app header logo vertical alignment
- fix: restore dark mode contrast in app header and active tab
- fix: normalize whisper JSON segments to {start, end, text} for frontend

### Removed
- chore: remove stale one-off docs from project root
- style: table typography, cell--mono class, favicon, remove installed action
- chore: replace Google Fonts CDN with Fontsource, remove @angular/material

### Other
- Revert "chore: release v1.1.4"
- chore: release v1.1.4
- Revert "chore: release v1.1.4"
- chore: release v1.1.4
- chore: ignore Playwright MCP screenshots and artifacts
- Merge pull request #17 from pawn002/claude/integrate-design-tokens-UqVdV
- 1.2.0
- style: clean up History tab — plain cells, serif empty state, fix hint contrast
- style: clean up Models tab — serif alert text, plain status/model cells
- chore: tighten electron-builder packaging — only bundle needed binaries
- perf: wire Vulkan backend into app, fix JSON output parsing, set default threads to 4
- perf: bump default threads 4→8, fix SYCL/Vulkan build scripts
- chore: upgrade Angular from v19 to v21
- chore: fix corrupted .gitignore entry for coverage directory
- chore: ignore jest coverage output directory
- Expand test suite to 57 tests across 4 files
- Align Candor implementation with actual component source
- Replace Angular Material with Candor design system
- Deepen Candor design system alignment from Storybook reference
- Integrate @candor-design/tokens design system


## [1.1.3] - 2026-01-02

### Added
- docs: add comprehensive security audit report

### Changed
- docs: update security audit with remediation status
- chore: update package-lock.json files after dependency install

### Fixed
- fix: update qs package to version 6.14.1 for security improvements
- fix: resolve all security vulnerabilities

### Other
- Merge pull request #15 from pawn002/claude/audit-security-issues-F0JbZ


## [1.1.2] - 2025-12-17

### Added
- feat: implement format-specific export with JSON-based transcription
- feat: add OpenVINO variant support and benchmarking
- feat: enhance build infrastructure and establish baseline performance metrics
- docs: add continuation guide for Intel optimization testing session
- feat: add Intel hardware optimization testing infrastructure

### Changed
- refactor: migrate to Electron-native architecture
- docs: document comprehensive SYCL build investigation and whisper.cpp update

### Fixed
- fix: remove backend references from release script
- fix: prevent Windows reserved device names in build output
- fix: enable timestamps in transcription results by default
- fix: display actual audio duration in History tab
- fix: downgrade uuid to v9.0.1 for CommonJS compatibility

### Removed
- chore: remove build artifacts from version control
- docs: remove redundant build step from distribution instructions

### Other
- Merge pull request #13 from pawn002/task-10-electron-native-backend
- chore: finalize post-migration cleanup
- docs: complete comprehensive documentation audit and corrections
- Merge branch 'main' into task-10-electron-native-backend


## [1.1.1] - 2025-11-28

### Added
- feat: display file size alongside filename in transcription UI
- docs: add Windows admin privilege warnings for dist commands
- docs: add Context7 MCP guidance to CLAUDE.md
- docs: add CLAUDE.md for Claude Code guidance

### Changed
- docs: comprehensive documentation audit and updates

### Fixed
- fix: wrap Electron IPC callbacks in NgZone for proper change detection
- fix: ensure toast notifications always appear at bottom-center
- fix: reset UI state when selecting a new audio file
- fix: configure baseHref per environment to fix dev server routing
- fix: update dev:electron script to use npx and tcp port check

### Removed
- refactor: remove deprecated ::ng-deep selector from app component
- chore: remove build artifact from git tracking


## [1.1.0] - 2025-11-17

### Added
- docs: add development and architecture guides
- docs: add comprehensive documentation in docs/ folder

### Changed
- docs: update Usage section to reflect current UI implementation

### Other
- docs: streamline documentation and link to official framework docs
- docs: streamline README to 179 lines, move details to docs folder


## [1.0.1] - 2025-11-17

### Added
- refactor: remove non-functional View details button and add copy confirmation
- feat: add interactive release automation script

### Changed
- docs: update Support section to reflect accurate information
- docs: update README.md to reflect current app state

### Fixed
- fix: improve backend startup reliability with retry logic and remove dev tools from production
- fix: resolve blank UI in packaged Electron app
- fix: resolve Windows build error with rcedit
- fix: display app version instead of OS version in status bar

### Removed
- refactor: remove non-functional Electron/Browser mode button
- refactor: remove unused code and styles

### Other
- a11y: improve keyboard navigation and focus states
- style: improve tab contrast against dark background
- Document release management process in README


## [1.0.0] - 2025-11-16

### Added
- Initial release of Whisper Electron App
- Offline speech-to-text transcription using Whisper.cpp
- Support for multiple Whisper models (tiny, base, small, medium, large)
- Model management tab with download functionality
- Multi-format audio support (MP3, WAV, OGG, M4A, FLAC, AAC, WEBM)
- Bundled ffmpeg for automatic audio format conversion
- Export transcriptions in multiple formats (TXT, JSON, SRT, VTT)
- Transcription history tab with metadata tracking
- Real-time transcription progress updates via WebSocket
- Material Design UI with Angular
- NestJS backend architecture
- Cross-platform support (Windows, macOS, Linux)
- Secure Electron IPC communication

### Features
- **Transcription Tab**: Upload and transcribe audio files with configurable options
- **History Tab**: View past transcriptions with audio duration and processing time
- **Models Tab**: Download and manage Whisper models
- **Native Save Dialogs**: Export transcripts with proper file type filters
- **Automatic Format Conversion**: Non-WAV files automatically converted to WAV using bundled ffmpeg
- **Progress Tracking**: Real-time progress updates during transcription
- **Metadata Tracking**: Track model used, audio duration, and transcription time

[1.0.0]: https://github.com/pawn002/whisper-electron-app/releases/tag/v1.0.0
