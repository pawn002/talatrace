# Troubleshooting

Start with the exact visible error and your installed version. TalaTrace 1.2.0 is validated on Windows x64; [Linux support](https://github.com/pawn002/talatrace/issues/24) remains open and macOS packaging is unverified. End users of the Windows package do not need a Node.js installation.

## Models are checking, missing or unavailable

**Checking models** means discovery is pending, not that weights are absent. Discovery reads file metadata; full integrity verification occurs on download and before recognition. If discovery fails, retain the exact error for a report rather than immediately deleting the library.

Open **Models** and check the row's status. App downloads go into the profile's `models/` directory, normally `%APPDATA%\whisper-electron-app\models`, or the retained `Whisper Transcription` profile for some older packaged installs. Repository `models/` is not the same runtime directory. See [Installation](installation.md#profile-and-model-storage).

An incomplete, wrong-size or known corrupt artifact is not offered as installed. Download a verified replacement through Models; a failed replacement does not publish over an existing file. When deliberately removing a model, use its **Delete** action. Do not bypass hash checks or substitute an HTML error page/manual filename rename for model weights.

**Parakeet runtime is not included** means its engine is missing or lacks the expected adapter marker; downloading weights cannot fix that. The Windows 1.2.0 package includes the runtime. For a source checkout, follow [Development](development.md#dependencies-and-native-setup) and verify `transcribe-runtime/version.json` as well as the executable.

## Microphone will not start or recording stops

Check Windows microphone privacy settings, the selected/default input device and whether another app is holding it. Distinguish a denied permission, no device and a device-open error using the app's message. There is no in-app microphone device picker in 1.2.0.

The status/header badge identify capture even when the frequency bars are quiet. Recording stops at 30 minutes; exceeding 64 MiB discards that capture with an error. **Stop & transcribe** releases the microphone before processing. If capture is already stopped but transcription fails, **Retry transcription** appears while the in-memory recording is retained. Save/copy needed transcripts before closing the app.

## Transcription fails, is slow or returns poor text

1. Confirm the selected model is installed and that its language supports the input. In **Transcription settings**, choose a known language if auto detection is wrong. Parakeet cannot translate; the current settings dialog does not expose a translation control.
2. Check that the source file really decodes; a supported filename extension alone is insufficient. Imports above 500 MiB are rejected. Do not overwrite the original audio while troubleshooting.
3. For source builds, check the native files in [Development](development.md#dependencies-and-native-setup). Parakeet also shares FFmpeg and the speech-detector infrastructure. A missing model, native executable or conversion tool are different failures.
4. Read audio duration/processing time under **Transcript details** or in History. Hash verification, model loading, preprocessing and the selected engine affect elapsed time. The [reference test](models.md#performance-evidence) is not a universal speed/quality ranking; larger does not guarantee better results for every clip.

Whisper chooses Vulkan when its binary exists, otherwise the CPU build. There is no automatic CPU retry after a failed GPU execution. For a native crash, report the model, engine, driver/hardware and exact diagnostics; do not disable antivirus or broadly weaken system permissions as a generic fix.

If no error appears, inspect process/resource activity and allow an active job to finish when practical. Force-closing loses session history and any retained capture. There is no user-facing job cancellation control or transcript editor in 1.2.0.

## Timing, pauses or copy/export differ

Recording speech times are estimates. Detector-labelled gaps can overlap recognition and do not establish why someone paused. Detection/alignment failures preserve the text and show a warning. A file import does not request all of the recording workflow's analysis flags. See [Usage](usage.md#read-copy-and-save) and [Models](models.md#timing-and-pauses).

**Include timing and pauses** controls workflow Copy and TXT. SRT/VTT use speech segments; JSON retains structured diagnostics. History Copy copies recognition text, not the workflow timeline. A copied file cannot recover words the recognizer omitted.

If copying fails, try **Save transcript…**. Persistent notifications remain until dismissed. Check the save extension: serialization is chosen from the actual `.txt`, `.json`, `.srt` or `.vtt` extension.

## Source-build and packaging failures

Use [Development](development.md) for the real runtime paths and known legacy setup limitations. `npm run build:whisper` writes a legacy `native/` layout; it is not a repair for missing current app runtimes. Run commands from the repo root and preserve local work when rebuilding.

If Electron behaves like Node, remove `ELECTRON_RUN_AS_NODE` from the shell before launch. A distribution failure mentioning macOS `.dylib` symlink creation inside electron-builder's Windows cache is a tool-extraction privilege issue; see [Releasing](releasing.md#build-environment). Administrator privileges are not a universal requirement for running or building the app. Do not disable antivirus or recursively change ownership of the checkout as a general remedy.

## Report a problem

Use [GitHub Issues](https://github.com/pawn002/talatrace/issues). Include the installed release version (Windows Installed Apps or downloaded release filename), Windows version, model/language, recording versus file input, exact error and reproducible steps. Contributors should also include their Node/npm versions and the command used. There is no system-info footer in the current UI.

`npm run start` exposes main/native diagnostics in its terminal. Whisper logs may contain recognized words and local file paths; redact them before sharing. There is no guaranteed rotating log-file viewer or general DevTools menu shortcut in the released app. Keep original audio/private transcripts out of public issue attachments unless you deliberately choose to share them.
