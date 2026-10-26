# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TalaTrace is a private speech-to-text Electron application using local Whisper and Parakeet models. Two-layer Electron-native architecture: Angular frontend and Electron main process with integrated services.

## Common Commands

### Development
```bash
npm run dev                 # Start all services (frontend, electron)
npm run dev:frontend        # Frontend only (http://localhost:4200)
npm run dev:electron        # Electron only (waits for frontend)
```

### Building
```bash
npm run build               # Build all (frontend, electron)
npm run build:frontend      # cd frontend && npm run build
npm run build:electron      # tsc -p electron
```

### Testing
```bash
cd frontend && npm test     # Jest — 70 tests across 4 spec files (no browser required)
```

### Packaging

```bash
npm run dist                # Build and package for current platform
npm run dist:win            # Windows — produces Setup.exe (NSIS, per-user) + .zip
npm run dist:mac            # macOS — produces .dmg + .zip
npm run dist:linux          # Linux — produces .AppImage + .deb
```

### Setup & Installation
```bash
npm run setup               # Full setup (deps, whisper.cpp, models)
npm run install:all         # Install frontend deps
npm run build:whisper       # Rebuild whisper.cpp
```

### Release
```bash
npm run release:interactive # Interactive release wizard
npm run version:patch       # Bump patch version
npm run version:minor       # Bump minor version
npm run version:major       # Bump major version
```

> **⚠️ Never bump the version or write CHANGELOG entries on a feature branch.**
> Version bumps and CHANGELOG updates are handled by `npm run release:interactive`
> **after** the PR is merged to main. Doing it on the branch creates noise in the
> diff and risks conflicts if the release cadence changes.

## Architecture

### Communication Flow
```
Angular (Renderer) <-> IPC (preload.ts) <-> Electron Main <-> Services <-> whisper.cpp
```

### Key Components

**Electron Main Process** (`electron/main.ts`):
- Window management with instant startup (no delays)
- IPC handlers for file dialogs, transcription, model management
- Service initialization and lifecycle management
- Direct IPC event emission for progress updates

**Electron Services** (`electron/services/`):
- `types.ts` - Shared TypeScript interfaces (TranscriptionOptions, TranscriptionResult, TranscriptionJob)
- `whisper.service.ts` - Whisper.cpp integration, FFmpeg conversion, model management
- `transcription.service.ts` - Job queue management, transcription orchestration, IPC event emission

**Electron Preload** (`electron/preload.ts`):
- Context-isolated bridge exposing `window.electronAPI`
- Safe IPC wrappers for renderer process

**Frontend** (`frontend/src/`):
- `app.module.ts` - Root Angular module
- `app.component.ts` - Root component with tab navigation
- `components/transcription/` - Main transcription UI component (Electron-only)
- `components/model-selector/` - Model management component (standalone)
- `components/history/` - Transcription history component (standalone)
- `services/electron.service.ts` - Electron IPC bridge service (note: located at `frontend/src/services/`, not `frontend/src/app/services/`)

### External Dependencies
- `whisper.cpp/` - Pre-built whisper-cli binary
- `models/` - Whisper model files (ggml-*.bin) - stored in user data directory for production
- `ffmpeg/` - Bundled FFmpeg for audio conversion

## IPC Channels

### Main Process Handlers (invoke-based)
| Channel | Purpose | Parameters | Returns |
|---------|---------|------------|---------|
| `select-audio-file` | Open file dialog | none | `{path: string, size: number}` or `null` |
| `transcribe-audio` | Start transcription | `audioPath: string, options: object` | `{success: boolean, data/error: any}` |
| `save-transcript` | Save transcript to file | `resultData: any` | `string` (file path) or `null` |
| `get-available-models` | List available models | none | Array of model objects |
| `download-model` | Download Whisper model | `modelName: string` | `{success: boolean, message: string}` |
| `get-system-info` | Get system information | none | System info object |
| `get-transcription-history` | Fetch transcription history | none | Array of transcription records |

### Renderer Process Events (on-based)
| Event | Purpose | Data |
|-------|---------|------|
| `transcription-progress` | Real-time transcription progress | `{jobId: string, progress: number, message?: string}` |
| `transcription-completed` | Transcription completed | `result: any` |
| `transcription-error` | Transcription error occurred | `error: string` |
| `model-download-progress` | Model download progress | `{modelName: string, progress: number}` |
| `menu-open-file` | Menu action: Open file | none |

## Service Architecture

### WhisperService (`electron/services/whisper.service.ts`)

**Responsibilities:**
- Whisper.cpp binary integration via child process spawning
- FFmpeg integration for audio format conversion (MP3, WAV, OGG, M4A, FLAC, AAC, WEBM)
- Model download from Hugging Face
- Model enumeration and availability checking
- Progress tracking via stdout/stderr parsing

**Key Methods:**
- `initialize()` - Set up paths, check binaries, migrate models
- `transcribe(audioPath, options, progressCallback)` - Run transcription
- `convertAudioToWav(inputPath)` - Convert audio to 16kHz mono WAV
- `downloadModel(modelName, progressCallback)` - Download model from Hugging Face
- `getAvailableModels()` - List installed and available models
- `getAudioDuration(audioPath)` - Get audio file duration in seconds using FFmpeg

**Path Resolution:**
- Development: `app.getAppPath()` for binaries
- Production: `process.resourcesPath` for binaries, `app.getPath('userData')` for models
- Platform-specific binary paths (Windows: `whisper-cli.exe`, Unix: `main`)

### TranscriptionService (`electron/services/transcription.service.ts`)

**Responsibilities:**
- Job queue management (in-memory Map)
- Transcription job lifecycle (pending → processing → completed/failed/cancelled)
- WhisperService orchestration
- IPC event emission for progress updates
- Transcription history management (last 50 jobs)

**Key Methods:**
- `processAudio(audioPath, options)` - Create and process transcription job
- `getJobStatus(jobId)` - Get job status
- `cancelJob(jobId)` - Cancel active job
- `getTranscriptionHistory()` - Get recent transcriptions
- `getAvailableModels()` - Delegate to WhisperService
- `downloadModel(modelName, progressCallback)` - Delegate to WhisperService

**IPC Event Emission:**
- `transcription-progress` - Emitted during processing with jobId, progress, message
- `transcription-completed` - Emitted when job completes with result
- `transcription-error` - Emitted on job failure with error message

### Transcription Options
- `model` - Model name (tiny, base, small, medium, large)
- `language` - Language code (optional, auto-detect if not specified)
- `outputFormat` - Output format (txt, json, srt, vtt)
- `timestamps` - Include timestamps (boolean)
- `threads` - Number of threads (number, default: 4)
- `translate` - Translate to English (boolean)
- `processors` - Number of processors (number, default: 1)

## Development Notes

- **Instant startup** - No backend server to wait for
- Services initialized directly in Electron main process on window creation
- Context isolation enabled - all renderer/main communication goes through preload.ts
- IPC events used for real-time transcription progress updates (no WebSocket)
- Supported audio formats: MP3, WAV, OGG, M4A, FLAC, AAC, WEBM (auto-converted via FFmpeg)
- Direct file access - no file uploads or temporary copies
- In-memory job storage - history cleared on app restart
- Models stored in user data directory in production (writable location)
- Model migration on first run from old `models/` directory to user data

## Styling Guidelines

- **NEVER use `::ng-deep`** - This selector is deprecated and will be removed in future Angular versions
- Use Angular's ViewEncapsulation strategies instead:
  - `ViewEncapsulation.None` for component-wide global styles
  - Component host element selectors (`:host ::ng-deep` replacement)
  - CSS custom properties (CSS variables) for theming
  - Direct element selectors within component templates

## Version Sync

The project maintains synchronized versions across `package.json` and `frontend/package.json`. Use `npm run version:*` commands which auto-sync via `scripts/sync-version.js`.

## File Structure

```
whisper-electron-app/
├── electron/
│   ├── main.ts              # Electron main process, IPC handlers, service initialization
│   ├── preload.ts           # Context bridge for IPC
│   ├── tsconfig.json        # TypeScript config with path aliases
│   └── services/
│       ├── types.ts         # Shared interfaces
│       ├── whisper.service.ts        # Whisper.cpp integration
│       └── transcription.service.ts  # Job management
├── frontend/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── app.component.ts
│   │   ├── components/
│   │   │   ├── transcription/
│   │   │   ├── model-selector/
│   │   │   └── history/
│   │   └── services/         # Note: services/ is directly under src/, not src/app/
│   │       └── electron.service.ts   # IPC bridge
│   └── package.json
├── whisper.cpp/             # Whisper binary and dependencies
├── models/                  # Default model location (migrated to user data)
├── ffmpeg/                  # FFmpeg binaries
├── scripts/                 # Build and setup scripts
├── package.json             # Root package configuration
└── CLAUDE.md                # This file
```

## Documentation Maintenance

When asked to audit the project and update documentation, you MUST:

1. **Audit All Documentation Files:**
   - Main `README.md` - Project overview, quick start, features
   - `CLAUDE.md` - This file (developer guidance for Claude Code)
   - `docs/README.md` - Documentation index
   - `docs/installation.md` - Setup and installation instructions
   - `docs/usage.md` - User guide and features
   - `docs/models.md` - Whisper models reference
   - `docs/troubleshooting.md` - Common issues and solutions
   - `docs/architecture.md` - Technical architecture details
   - `docs/development.md` - Developer contribution guide

2. **Verify Against Codebase:**
   - Check all IPC channels match implementation in `electron/main.ts` and `electron/preload.ts`
   - Verify service methods match `electron/services/*.ts`
   - Confirm file paths and component locations in frontend
   - Validate npm scripts in all `package.json` files
   - Check version synchronization across packages
   - Verify supported features match actual implementation
   - Confirm external dependencies (whisper.cpp, ffmpeg, models) are correctly documented

3. **Update Documentation:**
   - Fix any inaccuracies or outdated information
   - Add missing features or endpoints
   - Update version numbers if applicable
   - Ensure consistency across all documentation files
   - Update examples if APIs have changed

4. **Create Audit Report:**
   - Document all findings in `AUDIT_REPORT.md`
   - List all files reviewed
   - Note all changes made
   - Highlight any issues found
   - Provide recommendations for improvements

5. **Key Areas to Check:**
   - IPC channel names, parameters, and return types
   - Service methods and their signatures
   - IPC event names and data structures
   - Supported audio formats
   - Model names and sizes
   - npm script commands
   - File structure and component locations
   - Platform-specific instructions (especially Windows admin requirements)
   - Version numbers across all documentation

## Migration Notes (December 2025)

This project was migrated from a 3-layer architecture (Angular + NestJS + Electron) to a 2-layer Electron-native architecture (Angular + Electron) to:
- Eliminate 7-second backend startup delay
- Reduce code complexity (~1,300 lines removed)
- Remove HTTP/WebSocket infrastructure
- Simplify development and maintenance
- Create a more native Electron experience

All functionality was preserved during migration, including:
- Transcription with all options and formats
- Model management and downloads
- Real-time progress updates (now via IPC)
- Transcription history
- File operations and system integration
