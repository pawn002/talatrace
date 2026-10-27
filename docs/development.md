# Development Guide

Guide for developers who want to contribute to the TalaTrace or understand the development workflow.

## Table of Contents

- [Setting Up Development Environment](#setting-up-development-environment)
- [Project Architecture](#project-architecture)
- [Development Workflow](#development-workflow)
- [Code Structure](#code-structure)
- [Testing](#testing)
- [Building and Packaging](#building-and-packaging)
- [Contributing Guidelines](#contributing-guidelines)
- [Code Style](#code-style)

## Setting Up Development Environment

### Prerequisites

Ensure you have all the prerequisites installed as described in the [Installation Guide](installation.md).

### Clone and Setup

```bash
# Clone the repository
git clone https://github.com/pawn002/talatrace.git
cd talatrace

# Run complete setup
npm run setup
```

This will:
1. Install all dependencies (root, frontend)
2. Clone and build whisper.cpp
3. Download FFmpeg
4. Download base Whisper models

### IDE Setup

**Recommended IDEs:**
- Visual Studio Code
- WebStorm
- Any editor with TypeScript support

**VS Code Extensions:**
```json
{
  "recommendations": [
    "angular.ng-template",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### Environment Configuration

**frontend/src/environments/environment.ts** (already configured)
```typescript
export const environment = {
  production: false
};
```

Note: The application no longer requires a backend server. All business logic runs directly in the Electron main process via services.

## Project Architecture

### Technology Stack

**Frontend:**
- Angular 21
- Candor design system (CSS design tokens + component layer)
- Phosphor Icons (light weight icon set)
- Fontsource (bundled fonts: Roboto Flex, Roboto Mono, Noto Serif)
- RxJS (reactive programming)

**Electron:**
- Electron 35
- Context isolation enabled
- IPC for secure communication
- Services (TranscriptionService, WhisperService) in main process
- TypeScript throughout

**Transcription Engine:**
- whisper.cpp (C++ implementation)
- FFmpeg (audio conversion)

### Component Communication

```
Renderer Process (Angular)
    ↕️ (IPC via Preload)
Main Process (Electron)
    ├── TranscriptionService (job management)
    └── WhisperService (whisper.cpp integration)
            ↕️ (Child Process)
        Whisper.cpp Binary / FFmpeg
            ↕️ (File I/O)
        Audio Files & Models
```

**Key Points:**
- Direct IPC communication (no HTTP/WebSocket)
- Services run in Electron main process
- Child processes for whisper-cli and FFmpeg
- Models stored in user data directory

## Development Workflow

### Running in Development Mode

**Start all services at once:**
```bash
npm run dev
```

This starts:
- Frontend on http://localhost:4200
- Electron app (instant startup, no delay!)

**Start services individually:**

```bash
# Terminal 1 - Frontend
npm run dev:frontend

# Terminal 2 - Electron
npm run dev:electron
```

### Hot Reload

- **Frontend**: Automatic reload on file changes (Angular dev server)
- **Electron Services**: Requires Electron restart to pick up changes
- **Electron Main**: Manual reload (`Ctrl+R` / `Cmd+R`) or restart process

### Debugging

**Frontend Debugging:**
- Open browser DevTools (http://localhost:4200)
- Use Angular DevTools extension

**Electron Debugging:**
- Main process (including services): `--inspect` flag or VS Code debugger
- Renderer process: DevTools (`Ctrl+Shift+I` / `Cmd+Option+I`)

**VS Code Launch Configuration:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Electron Main",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev:electron"],
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Frontend",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:4200",
      "webRoot": "${workspaceFolder}/frontend/src"
    }
  ]
}
```

## Code Structure

### Frontend (Angular)

```
frontend/src/
├── app.component.ts          # Root component
├── components/
│   ├── transcription/        # Main transcription UI
│   │   ├── transcription.component.ts
│   │   ├── transcription.component.html
│   │   └── transcription.component.scss
│   ├── model-selector/       # Model management
│   │   ├── model-selector.component.ts
│   │   ├── model-selector.component.html
│   │   └── model-selector.component.scss
│   └── history/              # Transcription history
│       ├── history.component.ts
│       ├── history.component.html
│       └── history.component.scss
└── services/                 # Note: services/ is at src/ level, not app/ level
    └── electron.service.ts   # Electron IPC wrapper
```

**Key Patterns:**
- Component-based architecture
- Services for business logic
- RxJS Observables for async operations
- Candor design system (tokens-based CSS, no `::ng-deep`)

### Electron

```
electron/
├── main.ts            # Main process (Node.js environment)
│                      # - Window management
│                      # - IPC handlers
│                      # - Service initialization
├── preload.ts         # Preload script (sandboxed)
│                      # - Exposes safe APIs to renderer
└── services/          # Business logic services
    ├── types.ts       # Shared TypeScript interfaces
    ├── transcription.service.ts  # Job management, orchestration
    └── whisper.service.ts        # Whisper.cpp integration
```

**Key Patterns:**
- Context isolation enabled
- IPC for secure communication
- Preload script as bridge
- Service classes for business logic
- Direct child process spawning

## Testing

### Running Tests

**Frontend Tests (Jest):**
```bash
cd frontend
npm test                    # Run all 70 tests (Jest, no browser required)
```

Tests cover: component formatters, IPC callback closures (`onTranscriptionCompleted`,
`onTranscriptionError`, `onTranscriptionProgress`), model lifecycle, toast service,
and history auto-refresh. See `frontend/src/**/*.spec.ts`.

**Electron/Service Tests:**
Testing infrastructure for Electron services is minimal. Future improvements could include:
- Unit tests for service methods
- Integration tests for IPC handlers
- E2E tests for transcription workflow

### Writing Tests

**Framework Testing Guides:**
- [jest-preset-angular](https://thymikee.github.io/jest-preset-angular/) - Jest + Angular TestBed
- [Electron Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing)

**Project-Specific Testing Areas:**
- Test IPC handlers
- Test service methods (TranscriptionService, WhisperService)
- Test Whisper.cpp and FFmpeg process spawning
- Test error handling and edge cases
- Test progress event emission

## Building and Packaging

### Development Build

```bash
npm run build
```

Builds:
- Frontend: `frontend/dist/`
- Electron (including services): `dist/electron/`

### Production Package

> **⚠️ Windows Users**: All distribution commands require **administrator privileges**. Run your terminal as administrator before executing these commands.

```bash
# Build and package for current platform
npm run dist          # Requires admin on Windows

# Specific platforms
npm run dist:win      # Windows (requires admin)
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

Output: `release/` directory

### Build Configuration

**electron-builder** configuration in `package.json`:
- File inclusion/exclusion
- Resource bundling
- Platform-specific settings
- Signing configuration

## Contributing Guidelines

### Branching Strategy

- `main` - Production-ready code
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Commit Messages

Follow conventional commits:
```
feat: add new feature
fix: resolve bug
docs: update documentation
style: formatting changes
refactor: code restructuring
test: add tests
chore: maintenance tasks
```

### Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly
5. **Commit** with clear messages
6. **Push** to your fork
7. **Open** a pull request

**PR Checklist:**
- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] No new warnings/errors
- [ ] Documentation updated
- [ ] Commit messages follow convention

### Code Review

All PRs require:
- At least one approval
- Passing CI checks
- No merge conflicts

## Code Style

### Code Style Guidelines

**TypeScript:**
- Use strict mode
- Explicit types for public APIs
- Avoid `any`

**Framework Style Guides:**
- [Angular Style Guide](https://angular.dev/style-guide)
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)

**Project-Specific Rules:**
- Always validate file paths in IPC handlers
- Use OnPush change detection in Angular
- Unsubscribe from observables
- Clean up child processes (whisper-cli)
- Handle FFmpeg conversion errors gracefully

### Formatting

**Prettier** configuration (automated):
```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": false,
  "printWidth": 80,
  "tabWidth": 2
}
```

Run formatting:
```bash
npm run format
```

### Linting

**ESLint** configuration:
```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

## Development Best Practices

### Performance

- Lazy load Angular modules when possible
- Use OnPush change detection
- Debounce user input
- Cache model downloads
- Stream large files

### Security

- Never disable context isolation
- Validate all IPC messages
- Sanitize file paths
- Use TypeScript strict mode
- Keep dependencies updated

### Error Handling

- Use try-catch for async operations
- Provide meaningful error messages
- Log errors appropriately
- Show user-friendly messages in UI

### Accessibility

- Use semantic HTML
- Provide ARIA labels
- Ensure keyboard navigation
- Maintain focus states
- Test with screen readers

## Resources

### Documentation

- [Angular Docs](https://angular.dev/docs)
- [Electron Docs](https://www.electronjs.org/docs)
- [Electron IPC Guide](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [Candor Design System](https://github.com/pawn002/candor)

### Community

- [GitHub Issues](https://github.com/pawn002/talatrace/issues)
- [Discussions](https://github.com/pawn002/talatrace/discussions)

## Getting Help

If you're stuck:

1. Check existing [documentation](README.md)
2. Search [issues](https://github.com/pawn002/talatrace/issues)
3. Ask in [discussions](https://github.com/pawn002/talatrace/discussions)
4. Open a new issue with details
