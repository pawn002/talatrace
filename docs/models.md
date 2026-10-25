# Speech models

The app supports local Whisper transcription and a first Parakeet engine. All recognition stays on the device. Model downloads require a connection during setup; installed models work offline.

## Available models

| Model | Download size | Engine | Notes |
| --- | --- | --- | --- |
| Whisper Tiny | 75 MiB | whisper.cpp | Smallest download; useful for quick checks. |
| Whisper Base | 142 MiB | whisper.cpp | Existing default. |
| Whisper Small | 466 MiB | whisper.cpp | More processing than Base. Compare accuracy on your recordings. |
| Whisper Medium | 1.43 GiB | whisper.cpp | Higher resource requirements. |
| Whisper Large | 2.88 GiB | whisper.cpp | New downloads use Large v3; the historical `large` selection ID is retained. |
| Whisper Large v3 Turbo · Q5 | 548 MiB | whisper.cpp | Faster decoder with quantized weights; audio-aligned token timing enabled for recordings. |
| Parakeet TDT 0.6B v3 · Q8 | 706 MiB | transcribe.cpp | 25 European languages; token timings; no translation. Initial evaluation option. |

Sizes describe the pinned weight artifacts, rounded in binary units. They are not parameter counts, RAM estimates, or total installation sizes. The model catalog in `electron/services/model-catalog.ts` is the source of truth for IDs, revisions, files, bytes, SHA-256 hashes and supported languages.

The app does not offer English-only `.en` Whisper variants in this catalog. Speed and quality labels are guidance, not measurements of your hardware or guaranteed accuracy. Keep Base available while comparing the new choices. See [the model review](transcription-model-review.md) for the broader shortlist.

## Download and select

1. Open Models and download the desired model. Only a complete, checksum-verified download is published; failed downloads do not replace an existing model.
2. Open Transcription settings and choose an installed model.
3. Record an answer or import a file. Stop and copy the transcript through the existing workflow.

Changing models does not require changing the recording workflow. Parakeet's language list is limited to supported languages, with automatic detection available. If a previously selected language is unsupported, selection resets to Auto Detect. Parakeet cannot translate speech; use Whisper for translation.

A build without the Parakeet runtime displays an adjacent unavailable explanation and disables its download. Installed weights alone do not make an absent runtime usable.

## Timing and pauses

Completed results show the model, decoded audio duration, total processing time and audio/processing speed ratio. History uses the same duration and processing measurement. Duration comes from FFmpeg's decoded output clock, including quiet tails, so browser WebM recordings without duration headers are measured correctly. Processing includes preparation, model loading, recognition and timing analysis; first-run setup and device load can affect comparisons. Measurements are displayed in the app and retained in JSON, without adding performance text to the copied interview transcript. Earlier session entries without duration are not backfilled.

Whisper recordings request its model-specific DTW alignment where supported, including the Turbo preset. Parakeet exposes native token timestamps through the app's pinned CLI adapter. Both are estimates rather than exact word boundaries. Closing punctuation can be emitted late; it attaches to the preceding text without extending speech into silence.

Silero speech detection and quiet-level measurements run independently of recognition. They do not remove samples or change the recording clock. Recognition remains visible where detectors disagree. Invalid or incomplete token alignment preserves the full text with a warning instead of inventing timestamps. Long pauses are context, not evidence of thinking time.

## Development and packaging

Whisper continues to use the existing bundled runtime and FFmpeg. To build Parakeet's runtime:

```powershell
npm run setup:transcribe
```

On Windows this needs Git, CMake, Visual Studio 2022 C++ Build Tools and the Vulkan SDK. `npm run setup:transcribe -- --cpu` builds without Vulkan. The script pins transcribe.cpp v0.4.1 at `4d7c1ccefd39e5a9ea36cca5f8fefc6dcc14b99b`, checks the source patch, builds the CLI and copies it with version/license notices into ignored `transcribe-runtime/`. No Python is needed. Windows x64 with Intel Iris Xe is the validated target; other platforms need their own native verification.

The checked-in adapter patch exposes actual token rows in JSONL; the stock CLI's broad segment output is insufficient for this app's pause-aware transcript. Availability checks require the adapter version marker.

Build the runtime before packaging a release that offers Parakeet. The packaging resource list includes it, while only the existing Tiny/Base/Silero resources are bundled from `models/`. Extra test models and generated audio are excluded; additional recognition models download on demand. The ignored runtime executable and weights are not Git artifacts.

Run unit tests with `npm test`. Run the real offline workflow on a locally installed model using:

```powershell
$env:WHISPER_SMOKE_MODEL='parakeet-tdt-0.6b-v3'
npm run test:interview-smoke
```

Use `large-v3-turbo-q5_0` or `base` to select another smoke-test model. The test uses a public sample and synthetic microphone, an isolated profile, blocked renderer HTTP(S), a known long pause and intercepted clipboard writes.

## Attribution and compatibility

Whisper weights/code are MIT licensed. Parakeet v3 is developed by NVIDIA under CC-BY-4.0; this app uses the GGUF conversion published by handy-computer. The app retains runtime notices and identifies the source and conversion in its catalog. See the [NVIDIA model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) and [runtime source](https://github.com/handy-computer/transcribe.cpp/tree/v0.4.1).

Existing downloaded model files are not deleted by this change. Installation checks require the catalog's expected byte count; an older or partial artifact with a different size is not presented as ready. Re-download that model to obtain the pinned version, or return to the checkpoint build to use an older artifact.
