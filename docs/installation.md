# Install and update TalaTrace

## Windows release

TalaTrace 1.3.0 provides an unsigned Windows x64 installer and ZIP on the [release page](https://github.com/pawn002/talatrace/releases/latest). End users do not need Node.js, Python, CMake or a compiler. The package includes the native Whisper/Parakeet engines, FFmpeg and the speech detector. Recognition model weights are selected and downloaded in the app.

1. Download `TalaTrace-Setup-1.3.0.exe` or the ZIP, plus `SHA256SUMS.txt` if checking the download.
2. Close any existing TalaTrace/Whisper Transcription session after saving transcripts you need.
3. Run the installer, then launch **TalaTrace** from the Desktop or Start Menu. For the ZIP, extract the complete archive before running `TalaTrace.exe`; its resources must stay beside it.
4. Open **Models**, download a model, then select it in **Transcription settings**. See [Usage](usage.md) and [Models](models.md).

The release is unsigned; verify its source and checksum before deciding whether to run it. In PowerShell:

```powershell
Get-FileHash -LiteralPath .\TalaTrace-Setup-1.3.0.exe -Algorithm SHA256
```

Compare the hash with the matching filename in `SHA256SUMS.txt`. Allow disk space for the app, downloaded weights and temporary audio; [Models](models.md) lists the actual model sizes. Model size alone is not a RAM requirement or a hardware performance guarantee.

## Upgrade from Whisper Transcription

The existing GitHub repository was renamed to [pawn002/talatrace](https://github.com/pawn002/talatrace). Old repository links redirect. Do not create a new repository using the old name.

Close the app, back up its profile, then install over the existing installation. The 1.1.5 → 1.2.0-rc.1 → 1.2.0 Windows path was tested with retained models/preferences, renamed Desktop/Start Menu shortcuts and one unchanged uninstall entry. Fresh NSIS installation, uninstall and downgrade/rollback were not exercised for 1.2.0. See the [release notes](releases/1.2.0.md) for the validation limits.

History belongs to the current session; save transcripts before closing. Neither the rename nor installation makes session history persistent.

The 1.2.0 → 1.3.0 NSIS upgrade also passed with a fresh verified backup, all four model hashes retained, the same uninstall identity/shortcut targets and installed offline Tiny/Parakeet recognition. See [1.3.0 notes](releases/1.3.0.md). Fresh NSIS installation, uninstall and rollback remain untested.

## Profile and model storage

The internal package name stays `whisper-electron-app` for compatibility. On Windows the usual profile is `%APPDATA%\whisper-electron-app`; weights are in its `models` subdirectory. A packaged installation with an existing `%APPDATA%\Whisper Transcription` profile keeps that directory instead. Inspect the Models directory reported by the app's startup log when locating a particular installation.

In source/development mode, repository `models/` is also used for setup files and one-time migration. App downloads go to the writable profile, not back into the checkout. Deleting all models in the app intentionally leaves an empty library. A fresh packaged profile also requires model selection/download in Models; bundled resource files do not imply an installed model library.

Back up the complete profile while the app is closed if preserving preferences and downloaded weights. A backup inside `release/` will be deleted by `npm run clean:release`; keep recovery material outside that disposable folder. This project's ignored `.local-backups/` is used for local upgrade evidence.

## Linux and macOS

Linux support is [open work in #24](https://github.com/pawn002/talatrace/issues/24). 1.3.0 provides a separate experimental Linux x86_64 CPU prerelease. macOS remains unvalidated.

Candidate 5 is the accepted **experimental Linux x86_64 CPU deb** baseline. Core workflows passed on Ubuntu 26.04.1/XFCE/X11/PipeWire, alongside Ubuntu 24.04 CI. Read the [tested scope, known issues and remaining validation](linux.md#experimental-support-status). Get the deb from the [experimental prerelease](https://github.com/pawn002/talatrace/releases/tag/v1.3.0-linux-preview.1), then install with `sudo apt install ./TalaTrace-1.3.0-linux-amd64.deb`. Prefer the deb; AppImage launch under Ubuntu's namespace policy remains unresolved. This does not establish macOS support.

## Build from source

Contributors should follow [Development](development.md), including its native-runtime path checks and current setup-script limitations. Source setup is separate from installing the Windows release.

## Remove the app

For the installed Windows app, use **Settings → Apps → Installed apps → TalaTrace → Uninstall**. For a ZIP extraction, close the app before removing the extracted files. Removing a source checkout is not the same as uninstalling an installed app.

Downloaded weights/preferences reside in the profile described above. Back it up first if deciding to remove that data separately. The 1.2.0 uninstall/data-retention behavior has not been verified; this guide does not promise that uninstall preserves or deletes it.
