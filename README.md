# TalaTrace

Private audio recording and transcription with local Whisper and Parakeet models. Record an answer or import audio, then copy readable timing/pause context into a chat or terminal. Recognition stays on your device; model downloads need an initial connection.

Formerly **Whisper Transcription**. The existing repository is now [pawn002/talatrace](https://github.com/pawn002/talatrace); old links redirect. The internal package/installer identity and legacy profile directories remain stable to retain downloaded models and preferences.

## Download

Get the unsigned Windows x64 installer or ZIP and `SHA256SUMS.txt` from the [latest release](https://github.com/pawn002/talatrace/releases/latest). The Windows package includes both native recognition engines, FFmpeg and speech-detection resources; choose/download model weights in **Models**, then select the model in **Transcription settings**.

Windows is the stable 1.3.0 release target. See [Installation](docs/installation.md) for upgrade/storage details and [1.3.0 notes](docs/releases/1.3.0.md) for changes and tested limits. macOS is not a validated release target.

**Experimental Linux support:** a separate [Linux x86_64 CPU prerelease](https://github.com/pawn002/talatrace/releases/tag/v1.3.0-linux-preview.1) builds on candidate 5 desktop testing on Ubuntu 26.04.1/XFCE/X11/PipeWire and Ubuntu 24.04 native CI. Prefer the deb: AppImage launch remains blocked by Ubuntu's namespace policy. Read the [Linux support status and known issues](docs/linux.md#experimental-support-status) before installing. Full Linux support remains tracked in [#24](https://github.com/pawn002/talatrace/issues/24).

<!-- Preserve the Getting started fragment in the original blog post. -->
<a id="-quick-start"></a>

## Quick Start

In the app: **Record answer → Stop & transcribe → Copy transcript**. The Audio file subtab provides the equivalent import workflow. Enable **Include timing and pauses** for a readable timeline; timing/gaps are approximate context, not inferred thinking time. Save needed results: History belongs to the current session and is not a persistent archive.

For a source checkout:

```powershell
git clone https://github.com/pawn002/talatrace.git
cd talatrace
```

Follow [Development](docs/development.md) for npm/native dependencies and the known setup-script limitations before running the app. End users should use the packaged download rather than install a development toolchain.

## Contribute

Read [AGENTS.md](AGENTS.md), then use the [documentation index](docs/README.md). Common commands, once dependencies/native resources exist:

| Command | Purpose |
| --- | --- |
| `npm run start` | Build and launch the desktop app |
| `npm run dev` | Angular dev server plus Electron |
| `npm run build` | Compile renderer and main/preload/services |
| `npm test` | Frontend Jest and compiled Electron tests |
| `npm run preview:workflow` | Built-app workflow fixtures, screenshots and metrics |
| `npm run dist:win` | Package Windows NSIS/ZIP; see [Releasing](docs/releasing.md) first |

[Architecture](docs/architecture.md) explains the implementation; [Models](docs/models.md) describes current model behavior; [archived reviews](docs/archive/README.md) preserve research and past design decisions. Current user instructions belong in the guides, not duplicated audit logs.

MIT — see [LICENSE](LICENSE).
