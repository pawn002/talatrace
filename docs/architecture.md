# Architecture Overview

Technical architecture documentation for the TalaTrace.

## Table of Contents

- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [File Structure](#file-structure)
- [IPC Communication](#ipc-communication)
- [State Management](#state-management)
- [Build and Packaging](#build-and-packaging)

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │          Renderer Process (Angular)                │ │
│  │  ┌──────────────┐  ┌──────────────┐               │ │
│  │  │ Transcription│  │    Models    │               │ │
│  │  │  Component   │  │  Component   │               │ │
│  │  └──────────────┘  └──────────────┘               │ │
│  │  ┌──────────────────────────────────┐             │ │
│  │  │       History Component          │             │ │
│  │  └──────────────────────────────────┘             │ │
│  └────────────────────────────────────────────────────┘ │
│                        ↕️ IPC                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │           Main Process (Node.js)                   │ │
│  │  ┌──────────────────────────────────┐             │ │
│  │  │  Services (electron/services/)   │             │ │
│  │  │  - TranscriptionService          │             │ │
│  │  │  - WhisperService                │             │ │
│  │  └──────────────────────────────────┘             │ │
│  │  - Window Management                               │ │
│  │  - IPC Handlers                                    │ │
│  │  - File System Access                              │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                        ↕️ Child Process
┌─────────────────────────────────────────────────────────┐
│                  whisper.cpp Binary                      │
│  - Native C++ executable                                │
│  - Processes audio files                                │
│  - Outputs transcriptions                               │
└─────────────────────────────────────────────────────────┘
                        ↕️ Uses
┌─────────────────────────────────────────────────────────┐
│                  FFmpeg Binary                           │
│  - Audio format conversion                              │
│  - Preprocesses audio files                             │
└─────────────────────────────────────────────────────────┘
```

### Architecture Layers

1. **Presentation Layer** - Angular UI components
2. **Application Layer** - Electron main process with integrated services
3. **Integration Layer** - Whisper and transcription services (FFmpeg, whisper.cpp)
4. **Infrastructure Layer** - File system, models, audio files

> **Architecture Migration Note:** In December 2025, the application was refactored from a 3-layer architecture (Angular + NestJS + Electron) to a 2-layer Electron-native architecture. The NestJS backend was eliminated, with business logic moved directly into Electron main process services. This change eliminated the 7-second startup delay and simplified the communication from HTTP/WebSocket to direct IPC.

## Technology Stack

### Frontend
- **[Angular 21](https://angular.dev/)** - Web application framework
- **[Candor design system](https://github.com/pawn002/candor)** - CSS design tokens + component layer
- **[Phosphor Icons](https://phosphoricons.com/)** - Icon set (light weight)
- **[Fontsource](https://fontsource.org/)** - Bundled fonts (Roboto Flex, Roboto Mono, Noto Serif)
- **RxJS** - Reactive programming for state management

### Desktop (Electron)
- **[Electron 35](https://www.electronjs.org/)** - Cross-platform desktop framework
- **IPC** - Secure main/renderer communication
- **Context Isolation** - Security boundary
- **Services** - Business logic in main process (TranscriptionService, WhisperService)
- **Child Process** - Spawn whisper.cpp and FFmpeg binaries

### Audio Processing
- **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** - C++ Whisper implementation
- **[FFmpeg](https://ffmpeg.org/)** - Audio format conversion
- **Whisper Models** - Pre-trained neural networks (.bin files)

## Component Architecture

### Frontend Components

```
App Component
├── Transcription Component
│   ├── File selector
│   ├── Model selector
│   ├── Language selector
│   ├── Progress indicator
│   └── Result editor
├── Model Selector Component
│   ├── Model list
│   ├── Download manager
│   └── System info
└── History Component
    ├── History list
    └── Copy functionality
```

**Component Responsibilities:**

| Component | Responsibility |
|-----------|---------------|
| `AppComponent` | Layout, tab navigation, system info |
| `TranscriptionComponent` | File selection, settings, transcription UI |
| `ModelSelectorComponent` | Model management, downloads |
| `HistoryComponent` | Display past transcriptions |

### Electron Services

```
electron/services/
├── types.ts              # Shared TypeScript interfaces
├── transcription.service.ts
└── whisper.service.ts
```

**Service Responsibilities:**

| Service | Responsibility |
|---------|---------------|
| `TranscriptionService` | Job queue management, orchestration, IPC progress events |
| `WhisperService` | Integration with whisper.cpp, FFmpeg, model management |

**Key Features:**
- **Direct Integration**: Services run in Electron main process (no HTTP/WebSocket overhead)
- **IPC Events**: Real-time progress via `webContents.send()`
- **In-Memory Storage**: Job queue stored in `Map` (no database)
- **File Path Access**: Direct file system access (no file uploads)
- **Model Storage**: Models stored in user data directory (`app.getPath('userData')/models`)

## Data Flow

### Transcription Flow

```
1. User selects file
   ↓
2. Frontend → IPC invoke('transcribe-audio') → Main Process
   ↓
3. Main Process → TranscriptionService.processAudio()
   ↓
4. TranscriptionService validates file (size, format)
   ↓
5. TranscriptionService → WhisperService.convertAudioToWav() (FFmpeg)
   ↓
6. TranscriptionService → WhisperService.transcribe()
   ↓
7. WhisperService spawns whisper-cli child process
   ↓
8. whisper-cli processes audio, outputs progress to stdout
   ↓
9. WhisperService parses progress, notifies TranscriptionService
   ↓
10. TranscriptionService emits IPC event ('transcription-progress')
   ↓
11. Frontend receives progress updates via IPC listener
   ↓
12. whisper-cli completes with transcript
   ↓
13. TranscriptionService emits final result via IPC
   ↓
14. Frontend displays transcript
```

### Model Download Flow

```
1. User clicks Download
   ↓
2. Frontend → IPC invoke('download-model') → Main Process
   ↓
3. Main Process → WhisperService.downloadModel()
   ↓
4. WhisperService → Hugging Face API (HTTP request)
   ↓
5. WhisperService streams file, emits progress via IPC
   ↓
6. Frontend receives IPC events ('model-download-progress')
   ↓
7. Frontend updates progress bar
   ↓
8. Download completes
   ↓
9. WhisperService saves to app.getPath('userData')/models/
   ↓
10. Frontend updates model list
```

### History Retrieval Flow

```
1. User opens History tab
   ↓
2. Frontend → IPC invoke('get-transcription-history') → Main Process
   ↓
3. Main Process → TranscriptionService.getHistory()
   ↓
4. TranscriptionService returns in-memory history array
   ↓
5. Frontend displays history list
```

## Security Architecture

### Electron Security

**Context Isolation:**
```typescript
// Main Process
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false,      // ✅ Disabled
    contextIsolation: true,      // ✅ Enabled
    sandbox: true,               // ✅ Enabled
  }
});
```

**Preload Script Pattern:**
```typescript
// preload.ts - Exposes safe APIs
contextBridge.exposeInMainWorld('electronAPI', {
  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),
  transcribeAudio: (path, options) => 
    ipcRenderer.invoke('transcribe-audio', path, options),
});
```

**IPC Security:**
- All IPC uses `invoke/handle` pattern (async)
- Input validation on main process
- No direct Node.js access from renderer
- Sanitized file paths

### Service Security

**File Access Security:**
- File size limits (500MB default) validated in IPC handlers
- File type validation before processing
- Direct file path access (no temporary uploads)
- Read-only access to user-selected files

**Path Traversal Prevention:**
```typescript
// Validate file paths from IPC
const stats = await fs.promises.stat(audioPath);
if (stats.size > 500 * 1024 * 1024) {
  throw new Error('File exceeds 500MB limit');
}
```

**Model Storage Security:**
- Models stored in app.getPath('userData') - writable user directory
- Automatic migration from project directory on first run
- Download verification (file size, integrity)

## File Structure

### Development Structure

```
whisper-electron-app/
├── electron/          # Electron main, preload, and services
│   └── services/      # Business logic services
├── frontend/          # Angular frontend
├── whisper.cpp/       # Cloned whisper.cpp repo
├── models/            # Whisper model files (legacy, migrated on first run)
├── ffmpeg/            # FFmpeg binaries
└── scripts/           # Build scripts
```

### Production Structure (Packaged)

```
TalaTrace.exe
app.asar               # Frontend + Electron code (compressed)
resources/
  ├── whisper.cpp/
  │   ├── build-vulkan/bin/          # Vulkan iGPU backend (preferred when present)
  │   │   ├── whisper-cli.exe
  │   │   ├── ggml-vulkan.dll
  │   │   ├── ggml-cpu.dll
  │   │   ├── ggml-base.dll
  │   │   ├── ggml.dll
  │   │   └── whisper.dll
  │   └── build/bin/Release/         # CPU/AVX2 baseline fallback
  │       └── whisper-cli.exe
  ├── models/          # Pre-bundled models (migrated to user data on first run)
  │   ├── ggml-tiny.bin
  │   └── ggml-base.bin
  └── ffmpeg/
      └── bin/
          └── ffmpeg.exe

User Data Directory (app.getPath('userData')):
  └── models/          # Runtime model storage (writable location)
      ├── ggml-tiny.bin
      └── ggml-base.bin
```

## IPC Communication

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `select-audio-file` | Renderer → Main | Open file dialog |
| `transcribe-audio` | Renderer → Main | Start transcription |
| `save-transcript` | Renderer → Main | Save transcript to file |
| `get-available-models` | Renderer → Main | Fetch model list |
| `download-model` | Renderer → Main | Download Whisper model |
| `get-system-info` | Renderer → Main | Get system information |
| `get-transcription-history` | Renderer → Main | Fetch history |
| `transcription-progress` | Main → Renderer | Progress updates |
| `transcription-completed` | Main → Renderer | Completion event |
| `transcription-error` | Main → Renderer | Error event |
| `model-download-progress` | Main → Renderer | Model download progress |
| `menu-open-file` | Main → Renderer | Menu action to open file |

### IPC Pattern

```typescript
// Renderer (Angular Service)
async transcribe(filePath: string, options: Options): Promise<any> {
  const result = await window.electronAPI.transcribeAudio(
    filePath,
    options
  );
  return result;
}

// Listen for progress events
window.electronAPI.onTranscriptionProgress((data) => {
  console.log('Progress:', data.progress, data.message);
});

// Main Process (IPC Handler)
ipcMain.handle('transcribe-audio', async (event, audioPath: string, options: any) => {
  try {
    if (!transcriptionService) {
      return { success: false, error: 'Service not initialized' };
    }

    // Validate file size
    const stats = await fs.promises.stat(audioPath);
    if (stats.size > 500 * 1024 * 1024) {
      return { success: false, error: 'File exceeds 500MB limit' };
    }

    // Call service directly (no HTTP)
    const job = await transcriptionService.processAudio(audioPath, {
      model: options.model || 'base',
      language: options.language,
      outputFormat: options.outputFormat || 'txt',
      timestamps: options.timestamps !== false,
      threads: options.threads || 8,
      processors: options.processors || 1,
      translate: options.translate || false,
    });

    return { success: true, data: { id: job.id, status: job.status } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
```

## State Management

### Frontend State

**Component State:**
- Local UI state in components
- Form data (file selection, options)
- UI flags (loading, error states)

**Service State:**
- Shared state via Angular services
- RxJS for reactive state management
- No global state library needed
- IPC events for real-time updates

**Example:**
```typescript
@Injectable()
export class ElectronService {
  // Listen for IPC events
  constructor() {
    window.electronAPI.onTranscriptionProgress((data) => {
      // Update UI reactively
    });
  }
}
```

### Electron Main Process State

**In-Memory State (TranscriptionService):**
- Active transcription jobs (Map<string, TranscriptionJob>)
- Job history (last 50 jobs)
- Progress tracking per job

**In-Memory State (WhisperService):**
- Available models cache
- Model download progress

**Persistent State:**
- Downloaded models (file system: app.getPath('userData')/models)
- User preferences (future: could add JSON file or database)

## Build and Packaging

### Build Process

```
1. Frontend Build (Angular)
   - Compiles TypeScript → JavaScript
   - Bundles with Webpack
   - Outputs to frontend/dist/

2. Electron Build
   - Compiles TypeScript → JavaScript (main + services)
   - Outputs to dist/electron/

3. electron-builder Packaging
   - Creates app.asar (frontend + electron + services)
   - Bundles whisper.cpp binaries
   - Bundles models
   - Bundles FFmpeg
   - Creates platform-specific installer
```

### Packaging Configuration

**electron-builder (package.json):**
```json
{
  "files": [
    "dist/electron/**/*",
    "frontend/dist/**/*",
    "package.json"
  ],
  "extraResources": [
    {
      "from": "whisper.cpp/build-vulkan/bin",
      "to": "whisper.cpp/build-vulkan/bin",
      "filter": ["whisper-cli.exe", "whisper.dll", "ggml.dll", "ggml-base.dll", "ggml-cpu.dll", "ggml-vulkan.dll"]
    },
    {
      "from": "whisper.cpp/build-baseline/bin/Release",
      "to": "whisper.cpp/build/bin/Release",
      "filter": ["whisper-cli.exe", "whisper.dll", "ggml.dll", "ggml-base.dll", "ggml-cpu.dll"]
    },
    { "from": "models", "to": "models" },
    { "from": "ffmpeg", "to": "ffmpeg" }
  ]
}
```

**Key Changes from Previous Architecture:**
- No backend build step required
- Services bundled directly in app.asar with Electron code
- Smaller package size (no NestJS runtime dependencies)
- Faster build times

### Startup Sequence (Production)

```
1. User launches app
   ↓
2. Electron main process starts
   ↓
3. Create browser window
   ↓
4. Initialize services (TranscriptionService, WhisperService)
   ↓
5. Load frontend (from app.asar)
   ↓
6. App ready for user interaction (instant!)
```

**Performance Improvement:** Startup is now instant. The previous architecture required waiting 7 seconds for the NestJS backend to initialize before showing the UI. With services integrated directly into the Electron main process, the app is ready immediately.

## Performance Considerations

### Optimization Strategies

**Frontend:**
- Lazy load Angular modules
- OnPush change detection
- Virtual scrolling for large lists
- Debounce user input

**Electron Services:**
- Process transcriptions asynchronously with child processes
- Cache model metadata
- Efficient file I/O (direct file access, no uploads)
- In-memory job queue (no database overhead)

**Electron:**
- Separate main/renderer processes
- Offload heavy work (whisper-cli, FFmpeg) to child processes
- Direct IPC communication (no HTTP/WebSocket overhead)
- Instant startup (no backend initialization delay)

### Resource Management

**Memory:**
- Whisper models load into RAM (200MB - 8GB)
- Clean up temporary files
- Release resources after transcription

**CPU/GPU:**
- Default: 8 threads (benchmarked optimal for i7-1260P class hardware)
- Vulkan iGPU backend: 1.7–4x speedup on Intel Iris Xe (auto-selected when available)
- Background processing doesn't block UI

**Disk:**
- Temporary audio files cleaned up
- Model files cached permanently
- History stored as JSON (minimal space)

## Future Architecture Considerations

### Planned Improvements

1. **GPU Acceleration**
   - ✅ Vulkan iGPU (Intel Iris Xe) — 1.7–4x speedup, shipped
   - CUDA support (NVIDIA) — planned
   - Metal support (Apple Silicon) — planned

2. **Database Integration**
   - SQLite for history
   - Better querying and indexing
   - Full-text search

3. **Batch Processing**
   - Queue multiple files
   - Background processing
   - Progress tracking for all jobs

4. **Plugin System**
   - Custom post-processing
   - Third-party integrations
   - Extensible architecture

## Architecture Decisions

### Why Electron?

- Cross-platform desktop app
- Web technologies (familiar stack)
- Access to native APIs
- Large ecosystem

### Why Electron-Native Services (No Separate Backend)?

**Previous Architecture (Before Dec 2025):**
- Separate NestJS backend server
- HTTP/WebSocket communication
- 7-second startup delay
- Added complexity and dependencies

**Current Architecture (After Dec 2025):**
- Services integrated directly into Electron main process
- Direct IPC communication
- Instant startup
- Simplified codebase (~1,300 fewer lines)
- Lower memory footprint (no NestJS runtime)
- Easier debugging (no network layer)

**Decision Rationale:**
The separate backend was initially chosen for separation of concerns, but in practice:
1. The app is Electron-only (no browser mode needed)
2. HTTP/WebSocket added unnecessary complexity for inter-process communication
3. The 7-second startup delay hurt user experience
4. Electron main process can handle business logic directly
5. IPC is sufficient for communication needs

**Trade-offs:**
- ✅ Pros: Faster startup, simpler architecture, fewer dependencies, easier debugging
- ❌ Cons: Less separation of concerns (mitigated by service classes), tighter coupling to Electron

### Why Angular?

- Strong TypeScript support
- Dependency injection
- Block control flow (`@if`, `@for`) for clean templates
- Mature ecosystem

### Why whisper.cpp Over Other Implementations?

- Native C++ performance
- No Python runtime required
- Cross-platform support
- Active community
- Smaller memory footprint than Python implementation

## References

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron Main Process](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Angular Architecture](https://angular.io/guide/architecture)
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [FFmpeg](https://ffmpeg.org/documentation.html)
