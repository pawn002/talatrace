# Installation Guide

This guide covers source setup for TalaTrace. The 1.2.0 release provides a verified Windows x64 installer and ZIP; macOS/Linux packaging has not been validated for this release. Windows users can start with the [latest release](https://github.com/pawn002/talatrace/releases/latest) without installing Node.js or build tools. Source-build prerequisites follow below.

## Table of Contents

- [System Requirements](#system-requirements)
- [Prerequisites](#prerequisites)
- [Installation Steps](#installation-steps)
- [Platform-Specific Setup](#platform-specific-setup)
- [Verification](#verification)
- [Next Steps](#next-steps)

## System Requirements

### Minimum Requirements
- **RAM**: 4 GB (8 GB recommended for larger models)
- **Storage**: 2 GB free space (more for additional models)
- **OS**: 
  - Windows 10/11 (64-bit)
  - macOS 10.15+ (Catalina or later)
  - Ubuntu 20.04+ / Debian 11+

### Recommended Requirements
- **RAM**: 8 GB or more
- **Storage**: 5 GB free space
- **CPU**: Multi-core processor (4+ cores recommended)

## Prerequisites

### All Platforms

**[Node.js](https://nodejs.org/) and npm**
- Node.js 20.19+, 22.12+ or 24+ (matching Angular 21's engine requirement)
- npm v10.0.0 or higher

Verify installation:
```bash
node --version  # Check against the supported versions above
npm --version   # Should show v10.0.0 or higher
```

**Git**
- Required for cloning whisper.cpp during setup

### Platform-Specific Prerequisites

#### Windows

1. **[Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)**
   - Install "Desktop development with C++" workload

2. **[CMake](https://cmake.org/download/)**
   - Select "Add CMake to system PATH" during installation

3. **[Git for Windows](https://git-scm.com/download/win)**
   - Use default installation options

#### macOS

1. **Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```

2. **Verify Installation**
   ```bash
   xcode-select -p
   # Should output: /Library/Developer/CommandLineTools
   ```

#### Linux (Ubuntu/Debian)

1. **Build Tools**
   ```bash
   sudo apt-get update
   sudo apt-get install build-essential cmake git
   ```

2. **Verify Installation**
   ```bash
   gcc --version
   cmake --version
   git --version
   ```

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/pawn002/talatrace.git
cd talatrace
```

### 2. Run Setup Script

The setup script automates the entire installation process:

```bash
npm run setup
```

This command will:
1. Install root dependencies
2. Install frontend dependencies
3. Clone whisper.cpp repository
4. Build whisper.cpp for your platform
5. Download and bundle FFmpeg
6. Download tiny and base Whisper models (~113 MB)

**Expected Duration**: 5-15 minutes depending on your internet speed and CPU.

### 3. Verify Setup

After setup completes, verify the installation:

```bash
# Check if whisper.cpp baseline binary was built (Windows)
dir whisper.cpp\build-baseline\bin\Release\whisper-cli.exe

# Check if models were downloaded
ls models/

# Should see:
# ggml-tiny.bin
# ggml-base.bin
```

## Platform-Specific Setup

### Windows-Specific Steps

If you encounter permission errors during setup:

1. **Run as Administrator**
   - Right-click Command Prompt or PowerShell
   - Select "Run as administrator"
   - Navigate to project directory
   - Run `npm run setup`

2. **Antivirus/Windows Defender**
   - Some antivirus software may block the build process
   - Temporarily disable or add exception for the project folder

### macOS-Specific Steps

If you get "xcrun: error" during setup:

```bash
# Ensure Xcode Command Line Tools are properly installed
sudo xcode-select --reset
xcode-select --install

# Accept Xcode license
sudo xcodebuild -license accept
```

### Linux-Specific Steps

If setup fails with "Permission denied":

```bash
# Ensure you have proper permissions
sudo chown -R $USER:$USER .

# Re-run setup
npm run setup
```

## Verification

### Test the Application

After installation, test that everything works:

1. **Start Development Mode**
   ```bash
   npm run dev
   ```

2. **Verify Services**
   - Frontend should start on http://localhost:4200
   - Electron app should launch immediately (no startup delay)

3. **Test Transcription**
   - Select an audio file
   - Start transcription with the base model
   - Verify results appear

### Common Installation Issues

See the [Troubleshooting Guide](troubleshooting.md) for solutions to common installation problems.

## Next Steps

Once installation is complete:

1. **Read the Usage Guide** - Learn how to use all features: [usage.md](usage.md)
2. **Download Additional Models** - Get larger models for better accuracy: [models.md](models.md)
3. **Build Production App** - Create distributable package:

   > **⚠️ Windows Users**: Building distribution packages requires **administrator privileges**. Run your terminal as administrator before executing these commands.

   ```bash
   npm run dist    # Requires admin on Windows
   ```

## Updating

To update to the latest version:

```bash
# Pull latest changes
git pull origin main

# Re-run setup to update dependencies and rebuild
npm run setup
```

## Uninstallation

To completely remove the application:

```bash
# From the project directory
cd ..
rm -rf talatrace

# Or on Windows (PowerShell)
Remove-Item -Recurse -Force talatrace
```

Models and app data are stored in:
- **Windows**: `C:\Users\<username>\AppData\Roaming\whisper-electron-app`
- **macOS**: `~/Library/Application Support/whisper-electron-app`
- **Linux**: `~/.config/whisper-electron-app`

TalaTrace retains this legacy directory name to preserve existing models and preferences. Packaged installations that already used a `Whisper Transcription` directory continue using that directory instead. Renaming the app does not require downloading models again.
