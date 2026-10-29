# Development

Read [AGENTS.md](../AGENTS.md) before changes. Current behavior is described in [Architecture](architecture.md); UI construction requirements and adaptations live in the [Candor inventory](candor-widget-review.md). Windows x64 is the stable 1.3.0 target. The [Linux candidate guide](linux.md) covers Ubuntu 24.04 x86_64 build/test work and outstanding desktop validation; macOS packaging is unverified.

## Dependencies and native setup

Use Node.js 20.19+, 22.12+ or 24+, npm 10+, Git, CMake and Visual Studio 2022 C++ Build Tools for Windows native builds. These Node ranges match the installed Angular 21 package's engine requirement. A source build needs native runtimes; installing npm packages alone is insufficient.

```powershell
git clone https://github.com/pawn002/talatrace.git
cd talatrace
npm ci
npm --prefix frontend ci
```

Run the Windows x64 bootstrap for dependencies, CPU Whisper, Parakeet CPU, FFmpeg and setup weights:

```powershell
npm run setup
```

The bootstrap pins Whisper v1.8.4 to an exact commit and rejects unexpected revisions or tracked local edits rather than resetting work. Tiny/Base use the app's verified catalog; Silero and the dated FFmpeg archive require exact sizes and SHA-256 hashes. Downloads are cached under `.native-cache/`; a failed download preserves existing files. FFmpeg notices and provenance are staged with the runtime. Setup was exercised on the existing Windows development checkout; a fresh-machine bootstrap remains to be validated.

For the Parakeet Vulkan build, install the Vulkan SDK and run `npm run setup:transcribe` without `--cpu`. That script pins transcribe.cpp v0.4.1, verifies the adapter patch and stages the executable/version/license notices under `transcribe-runtime/`. CPU and Vulkan use separate build directories. No Python is needed for native recognition; Python is only used by evaluation preparation.

Verify these files before launching or packaging:

| Resource | Windows development path |
| --- | --- |
| CPU Whisper | `whisper.cpp/build-baseline/bin/Release/whisper-cli.exe` and its DLLs |
| Speech detector | `whisper.cpp/build-baseline/bin/Release/whisper-vad-speech-segments.exe` |
| Optional Whisper Vulkan | `whisper.cpp/build-vulkan/bin/whisper-cli.exe` and its DLLs |
| FFmpeg | `ffmpeg/bin/ffmpeg.exe` |
| Silero weights | `models/ggml-silero-v5.1.2.bin` |
| Parakeet | `transcribe-runtime/transcribe-cli.exe`, `version.json` and notices |

`npm run build:whisper` builds the current baseline for Windows or Linux. The baseline disables host-native tuning, but a locally built binary is not evidence of portability to every CPU. Packaging portable runtimes needs its own validation. Automated setup supports Windows/Linux x64; the Linux candidate uses static Whisper/ggml and CPU Parakeet. Unsupported hosts are rejected explicitly.

## Run and debug

```powershell
npm run start   # Build renderer/main, then run Electron with built files
npm run dev     # Angular server on :4200 and rebuilt main process
```

Alternatively run `npm run dev:frontend` and `npm run dev:electron` in separate terminals. Renderer changes hot-reload through Angular; restart Electron for main/preload/service changes. A renderer reload does not reload the main-process code. Browser-only Angular views do not provide the Electron bridge/native behavior.

If Electron launches as Node, remove the inherited flag in PowerShell before starting it:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

`npm run start` prints native paths and diagnostics in its terminal. Whisper currently prints recognition stdout as well; inspect/redact logs before sharing them. Parakeet keeps transcript JSON separate from its lifecycle/engine diagnostic logs. The current application menu is removed; do not promise a menu-driven DevTools shortcut. Main-process debugging can use Electron's inspector flags.

## Verify changes

| Command | Coverage / limits |
| --- | --- |
| `npm test` | Frontend Jest followed by compiled Electron/Node tests |
| `npm run test:electron` | Native service, model integrity/lifecycle, timing, recording storage, release tooling and WER tests |
| `npm run preview:workflow` | Real built app with isolated fixture IPC; screenshots and metrics in the OS temp `whisper-visual-review` directory |
| `npm run test:speech-activity` | Native speech detector with generated reference audio |
| `node tests/electron/packaged-release-smoke.cjs <path-to-exe>` | Actual packaged Windows EXE, isolated appData, local Base/Parakeet reference recognition, restart and clean-profile launch |
| `npm run eval:speech:prepare` / `npm run eval:speech` | Optional corpus preparation/local evaluation; see [Speech evaluation](speech-model-evaluation.md) |

Release 1.2.0 passed 130 frontend and 42 Electron tests; counts are a dated baseline, not a fixed promise for future revisions. Native/file-replacement tests must run in a normal writable Windows temp environment; a sandbox's EPERM on replacement is not automatically an app failure. Fixture previews are not real model inference or an installer upgrade test.

`npm run test:interview-smoke` now isolates appData, userData and sessionData before requiring main, seeds only the requested model through an owned hardlink, and aborts if main overrides isolation. It exercises real MediaRecorder capture with reference audio, a known long pause, local recognition, Copy, file import and a second recording. Set `WHISPER_SMOKE_MODEL` to another installed catalog ID. `WHISPER_SMOKE_PROFILE_ONLY=1` runs the fast startup/path guard. The earlier userData-only defect is recorded in the audit; do not assume old revisions were isolated. The packaged smoke's explicit `--real-profile` mode separately requires a backup manifest under `.local-backups/` and deliberately checks an installed profile.

For UI changes, follow AGENTS.md's rendered-review matrix; a passing Jest run/build is not visual review or a complete accessibility audit. The recorded extreme-zoom navigation gap and historical contrast/render evidence are in the [Candor inventory](candor-widget-review.md).

## Package and contribute

`npm run build` writes renderer output to `frontend/dist/` and main/preload/services to `dist/electron/`. `npm run dist:win` builds and invokes electron-builder; its Windows target is per-user NSIS plus ZIP. Native resources must already exist. See [Releasing](releasing.md) for artifact checks, the symlink-cache issue and upgrade validation. macOS/Linux target scripts exist but are not proof of support.

`npm run clean` removes compiled/Angular intermediates. `npm run clean:release` deletes `release/`; it is not safe storage for a recovery backup. Native checkouts, model files and `.local-backups/` remain separate.

Use a focused branch (Codex branches use `codex/`), make changes reviewable and run checks appropriate to the behavior. There are currently no npm `format`, `lint` or `lint:fix` scripts. `.github/workflows/linux.yml` runs native Linux setup, unit tests and installed/unpacked package checks; it does not establish Windows installer or physical desktop coverage. Keep final version bumps/release sections on main after merge; ongoing feature notes can be collected in the PR. The release wizard enforces main.
