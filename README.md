# Whisper Transcription

Offline speech-to-text Electron app using OpenAI's Whisper via whisper.cpp. Angular frontend, Electron main process — no backend server, no internet required after setup.

Record interview answers directly in the app: **Record answer → Stop & transcribe → Copy transcript**. Controls stay in stable positions, with a persistent recording status and final duration. Readable timestamped text and locally detected gaps in speech preserve pacing context for use in AI chats and TUIs. Original quiet-level measurements remain available for comparison. Existing audio-file transcription and TXT/SRT/VTT/JSON export remain available.

## Quick Start

**Prerequisites:** Node.js v20+, npm v10+, Git, and platform build tools (Visual Studio Build Tools on Windows, Xcode CLI on macOS, build-essential on Linux). See [Installation Guide](docs/installation.md) for details.

```bash
git clone https://github.com/pawn002/whisper-electron-app.git
cd whisper-electron-app
npm run setup   # installs deps, builds whisper.cpp, downloads FFmpeg + base models
npm run dev     # starts frontend (localhost:4200) + Electron
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev mode (frontend + Electron) |
| `npm run build` | Compile TypeScript + Angular |
| `npm run dist:win` | Build Windows installer — **run as administrator** |
| `npm run dist:mac` | Build macOS DMG |
| `npm run dist:linux` | Build Linux AppImage / deb |
| `npm run clean` | Remove intermediate build artifacts (`dist/`, `frontend/dist/`) |
| `npm run clean:release` | Remove installer output (`release/`) |
| `npm run release:interactive` | Guided release wizard (version bump, changelog, tag) |
| `npm test` | Run frontend Jest test suite |

## Project Structure

```
whisper-electron-app/
├── electron/        # Main process — IPC handlers, Whisper + transcription services
├── frontend/        # Angular renderer — UI components, Candor design system
├── build/           # Build assets (app icon)
├── scripts/         # Setup and release scripts
└── docs/            # Documentation

# Created by npm run setup (gitignored):
├── whisper.cpp/     # Whisper.cpp binary
├── models/          # Downloaded Whisper model files
└── ffmpeg/          # Bundled FFmpeg
```

## Documentation

| Guide | Contents |
|---|---|
| [Installation](docs/installation.md) | Full setup instructions for all platforms |
| [Usage](docs/usage.md) | Transcription workflow, model management, export formats |
| [Models](docs/models.md) | Model comparison, recommendations, performance benchmarks |
| [Development](docs/development.md) | Dev environment, architecture, testing, contributing |
| [Architecture](docs/architecture.md) | IPC design, service layer, security model |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and fixes |

## Contributing

1. Fork and create a feature branch
2. Follow the commit and PR conventions in [docs/development.md](docs/development.md)
3. Run `npm test` before opening a PR

## License

MIT — see [LICENSE](LICENSE)
