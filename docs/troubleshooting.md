# Troubleshooting Guide

Solutions to common issues when installing, building, or using the TalaTrace.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Build Issues](#build-issues)
- [Runtime Issues](#runtime-issues)
- [Transcription Issues](#transcription-issues)
- [Performance Issues](#performance-issues)
- [Getting Further Help](#getting-further-help)

## Installation Issues

### Git Not Found

**Error**: `'git' is not recognized as an internal or external command`

**Solution**:
- **Windows**: Install Git from https://git-scm.com/download/win
- **macOS**: Run `xcode-select --install`
- **Linux**: Run `sudo apt-get install git`

After installation, restart your terminal and try again.

### Node.js Version Too Old

**Error**: `The engine "node" is incompatible with this module`

**Solution**:
1. Check your Node.js version: `node --version`
2. If below v18.0.0, download latest from https://nodejs.org/
3. Install and restart terminal
4. Verify: `node --version` should show v18+

### NPM Install Fails

**Error**: Various errors during `npm install`

**Solutions**:

1. **Clear npm cache**:
   ```bash
   npm cache clean --force
   npm install
   ```

2. **Delete node_modules and retry**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Use different npm registry** (if corporate firewall):
   ```bash
   npm config set registry https://registry.npmjs.org/
   ```

## Build Issues

### Whisper.cpp Build Fails (Windows)

**Error**: `CMake not found` or `MSBuild not found`

**Solution**:
1. Install Visual Studio 2019+ with "Desktop development with C++" workload
2. Install CMake from https://cmake.org/download/
3. Add CMake to PATH during installation
4. Restart terminal and run `npm run setup` again

### Whisper.cpp Build Fails (macOS)

**Error**: `xcrun: error: invalid active developer path`

**Solution**:
```bash
xcode-select --install
sudo xcodebuild -license accept
```

**Error**: `ld: library not found`

**Solution**:
```bash
sudo xcode-select --reset
xcode-select --install
```

### Whisper.cpp Build Fails (Linux)

**Error**: `make: command not found` or `g++: command not found`

**Solution**:
```bash
sudo apt-get update
sudo apt-get install build-essential cmake git
```

**Error**: `Permission denied` during build

**Solution**:
```bash
sudo chown -R $USER:$USER .
npm run setup
```

### FFmpeg Download Fails

**Error**: `Failed to download FFmpeg`

**Solutions**:

1. **Check internet connection**

2. **Manual download**:
   - Windows: https://github.com/BtbN/FFmpeg-Builds/releases
   - macOS: `brew install ffmpeg` then copy to `ffmpeg/bin/`
   - Linux: `sudo apt-get install ffmpeg` then symlink to `ffmpeg/bin/`

3. **Retry download**:
   ```bash
   node scripts/download-ffmpeg.js
   ```

### Model Download Fails

**Error**: `Failed to download model` or timeout errors

**Solutions**:

1. **Check internet connection**

2. **Manual download**:
   - Go to https://huggingface.co/ggerganov/whisper.cpp/tree/main
   - Download desired model file (e.g., `ggml-base.bin`)
   - Place in `models/` directory
   - Rename if needed to match `ggml-{name}.bin` format

3. **Download from UI**:
   - Launch the app
   - Go to Models tab
   - Click Download button

## Runtime Issues

### Blank White Screen (Electron App)

**Error**: Application launches but shows blank window

**Solutions**:

1. **Check DevTools** (if enabled):
   - Press `Ctrl+Shift+I` / `Cmd+Option+I`
   - Look for errors in Console tab

2. **Rebuild the app**:
   ```bash
   npm run build
   npm run dist
   ```

3. **Check frontend dist folder**:
   ```bash
   ls frontend/dist/
   # Should contain index.html and JS files
   ```

### Whisper Binary Not Found

**Error**: `Whisper binary not found` or `ENOENT: no such file or directory`

**Solutions**:

1. **Verify binaries exist** (Windows):
   ```bash
   # Vulkan backend (preferred)
   dir whisper.cpp\build-vulkan\bin\whisper-cli.exe

   # Baseline CPU fallback
   dir whisper.cpp\build-baseline\bin\Release\whisper-cli.exe
   ```

   The app uses the Vulkan binary if present, otherwise falls back to baseline.

2. **Rebuild whisper.cpp**:
   ```bash
   npm run setup
   ```

3. **Check permissions** (macOS/Linux):
   ```bash
   chmod +x whisper.cpp/build-baseline/bin/whisper-cli
   ```

### Model Not Found Error

**Error**: `Model not found: ggml-base.bin`

**Solutions**:

1. **Check models directory**:
   ```bash
   ls models/
   ```

2. **Re-download models**:
   - Open app
   - Go to Models tab
   - Download the missing model

3. **Verify filename**:
   - Models must be named `ggml-{name}.bin`
   - Example: `ggml-base.bin`, `ggml-small.bin`

## Transcription Issues

### Transcription Fails Immediately

**Error**: Transcription starts but fails within seconds

**Solutions**:

1. **Check audio file**:
   - Ensure file isn't corrupted
   - Try a different audio file
   - Verify file format is supported

2. **Check FFmpeg**:
   ```bash
   # Should exist
   ls ffmpeg/bin/
   ```

3. **Check Electron DevTools**:
   - Press `Ctrl+Shift+I` / `Cmd+Option+I`
   - Check Console for error messages
   - Look for file path or permission errors

### Transcription Produces Gibberish

**Error**: Result is nonsensical text or wrong language

**Solutions**:

1. **Try larger model**:
   - Download `small` or `medium` model
   - Retry transcription

2. **Specify language**:
   - Instead of "Auto Detect", select the specific language
   - Retry transcription

3. **Check audio quality**:
   - Ensure audio is clear
   - Reduce background noise if possible
   - Higher quality audio = better results

### Audio Conversion Fails

**Error**: `FFmpeg conversion failed` or `Unsupported format`

**Solutions**:

1. **Verify FFmpeg installation**:
   ```bash
   # Windows
   ffmpeg\bin\ffmpeg.exe -version
   
   # macOS/Linux
   ffmpeg/bin/ffmpeg -version
   ```

2. **Convert audio manually**:
   - Use online converter to convert to WAV
   - Try transcribing the WAV file

3. **Re-download FFmpeg**:
   ```bash
   node scripts/download-ffmpeg.js
   ```

### Slow Transcription

See [Performance Issues](#performance-issues) below.

## Performance Issues

### Transcription is Very Slow

**Causes and Solutions**:

1. **Model too large for hardware**:
   - Use smaller model (tiny or base)
   - Close other applications
   - Check RAM usage

2. **Large audio file**:
   - This is normal for long files
   - See estimated times in [Usage Guide](usage.md)
   - Consider splitting into smaller segments

3. **Insufficient RAM**:
   - Close unnecessary applications
   - Upgrade RAM if possible
   - Use tiny model for large files

4. **CPU at 100%**:
   - This is normal during transcription
   - Whisper is CPU-intensive
   - Do not interrupt the process

### Application is Unresponsive

**Error**: App freezes or becomes unresponsive

**Solutions**:

1. **Wait for transcription to complete**:
   - Long transcriptions can take time
   - App may appear frozen but is working

2. **Check system resources**:
   - Open Task Manager (Windows) / Activity Monitor (macOS)
   - Verify whisper-cli process is running
   - Check if RAM is full

3. **Force close and restart**:
   - Close the application
   - Clear temporary files
   - Restart the app

### High Memory Usage

**Issue**: App uses lots of RAM

**Solutions**:

1. **Use smaller model**:
   - tiny and base use less RAM
   - large can use 4-8 GB

2. **Close other applications**:
   - Free up RAM for transcription

3. **This is normal**:
   - Whisper models load entirely into RAM
   - Memory is released after transcription

## Getting Further Help

If your issue isn't covered here:

### 1. Check Existing Issues

Search the GitHub issue tracker:
https://github.com/pawn002/talatrace/issues

### 2. Collect Diagnostic Information

Before reporting an issue, collect:

- **Operating System**: Windows/macOS/Linux version
- **Node.js version**: Run `node --version`
- **App version**: Check footer in the app
- **Error messages**: Copy exact error text
- **Steps to reproduce**: What you did before the error occurred

### 3. Check Log Files and Console

Application data directory:
- **Windows**: `C:\Users\<user>\AppData\Roaming\whisper-electron-app\`
- **macOS**: `~/Library/Application Support/whisper-electron-app/`
- **Linux**: `~/.config/whisper-electron-app/`

The legacy folder name is intentional after the TalaTrace rename. Packaged installations with an existing `Whisper Transcription` profile continue using that folder instead.

**Electron DevTools Console**:
- Press `Ctrl+Shift+I` / `Cmd+Option+I` to open DevTools
- Check Console tab for errors
- Look for specific error messages and stack traces

### 4. Report the Issue

Create a new issue: https://github.com/pawn002/talatrace/issues/new

Include:
- Operating system and version
- Node.js version
- App version
- Detailed description of the problem
- Steps to reproduce
- Error messages
- Relevant log excerpts

## Common Error Messages

### "ENOENT: no such file or directory"

**Meaning**: A required file is missing

**Solution**: Run `npm run setup` to reinstall/rebuild

### "Cannot find module"

**Meaning**: A dependency is missing

**Solution**:
```bash
npm install
cd frontend && npm install
cd ..
```

### "Spawn ENOENT" or "Process Failed"

**Meaning**: Whisper.cpp or FFmpeg binary not found or can't be executed

**Solution**:
1. **Verify binaries exist**:
   ```bash
   # Windows
   dir whisper.cpp\whisper-cli.exe
   dir ffmpeg\bin\ffmpeg.exe

   # macOS/Linux
   ls -la whisper.cpp/whisper-cli
   ls -la ffmpeg/bin/ffmpeg
   ```

2. **Rebuild if missing**:
   ```bash
   npm run setup
   ```

3. **Check permissions** (macOS/Linux):
   ```bash
   chmod +x whisper.cpp/build-baseline/bin/whisper-cli
   chmod +x ffmpeg/bin/ffmpeg
   ```
