# Speech models

The app supports local Whisper transcription and a first Parakeet engine. All recognition stays on the device. Model downloads require a connection during setup; installed models work offline.

## Available models

| Model | Download size | Engine | Notes |
| --- | --- | --- | --- |
| Whisper Tiny | 75 MiB | whisper.cpp | Smallest download; useful for quick checks. |
| Whisper Base | 142 MiB | whisper.cpp | Existing default. |
| Whisper Small | 466 MiB | whisper.cpp | More processing than Base. Compare accuracy on your recordings. |
| Whisper Medium | 1.43 GiB | whisper.cpp | Higher resource requirements. |
| Whisper Large v3 | 2.88 GiB | whisper.cpp | Segment-level timestamps; the historical `large` selection ID is retained. |
| Whisper Large v3 Turbo · Q5_0 | 548 MiB | whisper.cpp | Faster decoder with quantized weights; audio-aligned token timing enabled for recordings. |
| Parakeet TDT 0.6B v3 · Q8_0 | 706 MiB | transcribe.cpp | 25 European languages; token timings; no translation. Initial evaluation option. |

Sizes describe the pinned weight artifacts, rounded in binary units. They are not parameter counts, RAM estimates, or total installation sizes. The model catalog in `electron/services/model-catalog.ts` is the source of truth for IDs, revisions, files, bytes, SHA-256 hashes and supported languages.

Each Models row uses the same identity format: model/version/quantization, then a linked Hugging Face repository identifier. The repository identifies the implemented conversion: `ggerganov/whisper.cpp` for Whisper and `handy-computer/parakeet-tdt-0.6b-v3-gguf` for Parakeet. Links are derived from the pinned artifact URLs; the original upstream source and license metadata remain in the catalog. Descriptive model paragraphs are omitted from the table. Download uses Candor's subdued tertiary treatment without an outline; no download is promoted above the others. Required unavailable-runtime explanations remain beside disabled controls.

The app does not offer English-only `.en` Whisper variants in this catalog. Table badges show reference speed and word error rate from the [documented English reading test](speech-model-evaluation-2026-10-25.md), not a prediction for the current device or a universal quality grade. Higher audio/processing speed and lower word error rate are better. Neutral badges retain their meaning without colour; missing results say "Not measured". The visible table note identifies the dataset, sample and reference hardware. Keep Base available while comparing the new choices. See [the model review](transcription-model-review.md) for the broader shortlist.

## Download and select

1. Open Models and download the desired model. Only a complete, checksum-verified download is published; failed downloads do not replace an existing model.
2. Open Transcription settings and choose an installed model.
3. Record an answer or import a file. Stop and copy the transcript through the existing workflow.

Changing models does not require changing the recording workflow. Parakeet's language list is limited to supported languages, with automatic detection available. If a previously selected language is unsupported, selection resets to Auto Detect. Parakeet cannot translate speech; use Whisper for translation.

A build without the Parakeet runtime displays an adjacent unavailable explanation and disables its download. Installed weights alone do not make an absent runtime usable.

The model store verifies installed weights against the catalog's SHA-256, not just file size. Verification is cached until the file's identity or modification metadata changes. Missing, truncated and checksum-invalid files are excluded from installed choices, and Whisper rejects them before starting recognition with instructions to download again from Models. Catalog refreshes retain each model's active-download state independently, including when another download finishes or fails. Existing corrupt files are left in place until a verified replacement is ready; the app does not treat a saved HTTP error body as an installed model.

## Timing and pauses

Completed results show the model, decoded audio duration, total processing time and audio/processing speed ratio. History uses the same duration and processing measurement. Duration comes from FFmpeg's decoded output clock, including quiet tails, so browser WebM recordings without duration headers are measured correctly. Processing includes preparation, model loading, recognition and timing analysis; first-run setup and device load can affect comparisons. Measurements are displayed in the app and retained in JSON, without adding performance text to the copied interview transcript. Earlier session entries without duration are not backfilled.

Whisper recordings request its model-specific DTW alignment where supported, including the Turbo preset. Parakeet exposes native token timestamps through the app's pinned CLI adapter. Both are estimates rather than exact word boundaries. Closing punctuation can be emitted late; it attaches to the preceding text without extending speech into silence.

Parakeet partitions normalized audio inside detector-estimated gaps of at least five seconds. This mitigates a reproduced native failure where speech after a long pause was silently omitted. Every audio sample is retained, including sound the detector may have missed; gaps select boundaries rather than removing audio. All pieces are decoded in one native batch, and token times are shifted back onto the original recording clock. Long gaps remain in the transcript metadata. JSON exports include `recognitionChunks` for auditing. If speech detection is unavailable, recognition falls back to the full input with a warning that the pause mitigation could not run. This does not resolve every kind of native omission.

Silero speech detection and quiet-level measurements estimate gaps independently of recognition. They do not remove samples or change the recording clock. Recognition remains visible where detectors disagree. Invalid or incomplete token alignment preserves the full text with a warning instead of inventing timestamps. Long pauses are context, not evidence of thinking time.

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
