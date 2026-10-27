# Speech models

TalaTrace 1.2.0 supports local Whisper and Parakeet transcription. All recognition stays on the device. Downloads require a connection; installed models work offline with the packaged runtimes.

## Available models

| Model | Download size | Engine | Notes |
| --- | --- | --- | --- |
| Whisper Tiny | 75 MiB | whisper.cpp | Smallest download; useful for quick checks. |
| Whisper Base | 142 MiB | whisper.cpp | Initial preference; subsequent sessions restore the selected model. |
| Whisper Small | 466 MiB | whisper.cpp | More processing than Base. Compare accuracy on your recordings. |
| Whisper Medium | 1.43 GiB | whisper.cpp | Higher resource requirements. |
| Whisper Large v3 | 2.88 GiB | whisper.cpp | Segment-level timestamps; the historical `large` selection ID is retained. |
| Whisper Large v3 Turbo · Q5_0 | 548 MiB | whisper.cpp | Faster decoder with quantized weights; audio-aligned token timing enabled for recordings. |
| Parakeet TDT 0.6B v3 · Q8_0 | 706 MiB | transcribe.cpp | Implemented engine; 25 European languages, token timings, no translation. |

Sizes describe the pinned weight artifacts, rounded in binary units. They are not parameter counts, RAM estimates, or total installation sizes. The model catalog in `electron/services/model-catalog.ts` is the source of truth for IDs, revisions, files, bytes, SHA-256 hashes and supported languages.

Each Models row uses the same identity format: model/version/quantization, then a linked Hugging Face repository identifier. The repository identifies the implemented conversion: `ggerganov/whisper.cpp` for Whisper and `handy-computer/parakeet-tdt-0.6b-v3-gguf` for Parakeet. Links are derived from the pinned artifact URLs; the original upstream source and license metadata remain in the catalog. Descriptive model paragraphs are omitted from the table. Download and Delete use Candor's ghost treatment without a resting fill or outline; no download is promoted above the others. Required unavailable-runtime explanations remain beside disabled controls.

The app does not offer English-only `.en` Whisper variants in this catalog.

## Performance evidence

The table displays plain reference speed/error values, not badges or a universal quality grade. They come from the [25 October English reading test](archive/speech-model-evaluation-2026-10-25.md): 12 LibriSpeech test-clean speakers, 265 normalized words and 99.93 seconds, on an i7-1260P/Iris Xe with four threads and timing/pause metadata. Higher audio/processing speed and lower word error rate are better within that test. Missing results say Not measured. The visible table note identifies the dataset and hardware; it is not a prediction for this device, conversational interviews or other languages. The [earlier model review](archive/transcription-model-review.md) is historical research, not the implemented catalog.

Activate the Model, Size, Reference speed, Word error rate or Status heading to sort; activate it again to reverse direction. Enter and Space work on the header buttons. Speed starts fastest first; the other columns start ascending (smallest size, lowest error rate, or natural alphabetical model/status order). The active header shows a single direction arrow and exposes `aria-sort`; Actions is not sortable. The initial view retains catalog order. Size uses raw bytes and performance uses unrounded reference values, so mixed units and equally rounded values do not give incorrect order. Unmeasured/invalid numeric values stay last in either direction, and ties retain catalog order. Sort choice and header focus survive catalog refreshes after downloads; sort selection lasts for the current component session.

## Download and select

1. Open Models and download the desired model. Only a complete, checksum-verified download is published; failed downloads do not replace an existing model.
2. Open **Transcription settings** beside **Include timing and pauses** in the workflow card. Choose an installed model in the modal dialog, then select **Done** (or close it with Escape). Changes apply immediately to the next transcription.
3. Record an answer or import a file. Stop and copy the transcript through the existing workflow.

Changing models does not require changing the recording workflow. Parakeet's language list is limited to supported languages, with automatic detection available. If a previously selected language is unsupported, selection resets to Auto Detect. Parakeet cannot translate speech. The current settings dialog does not expose a translation control; backend Whisper translation support is not a visible user workflow.

Your selected model is saved locally and restored next session. If it is no longer installed or usable, the app selects Base when available, otherwise the first usable installed model, and saves that fallback. With no installed models, the workflow offers model setup.

Installed models offer **Delete** in the Actions column to reclaim disk space. This removes only that model's weights; it can be downloaded again. Deletion is blocked while transcription is running or that model is downloading. Deleting the selected model immediately refreshes the workflow's available choices. The app does not automatically download Tiny after you empty the model library.

A build without the Parakeet runtime displays an adjacent unavailable explanation and disables its download. Installed weights alone do not make an absent runtime usable.

Catalog discovery checks file presence and expected size without hashing every model on startup or each refresh. Downloads are checksum-verified before publication, and the selected engine verifies its weights against the catalog's SHA-256 before recognition. That integrity result is cached until the file's identity or modification metadata changes. Missing, truncated and known checksum-invalid files are excluded from installed choices; same-size corruption discovered before use blocks recognition and is excluded on the next refresh. Catalog refreshes retain each model's active-download state independently, including when another download finishes or fails. Existing corrupt files are left in place until a verified replacement is ready; the app does not treat a saved HTTP error body as an installed model.

## Timing and pauses

Completed results keep the model, decoded audio duration, total processing time and audio/processing speed ratio in the collapsed Transcript details footer, leaving the words as the primary reading content. History uses the same duration and processing measurement. Duration comes from FFmpeg's decoded output clock, including quiet tails, so browser WebM recordings without duration headers are measured correctly. Processing includes preparation, model loading, recognition and timing analysis; first-run setup and device load can affect comparisons. Measurements are displayed in the app and retained in JSON, without adding performance text to the copied interview transcript. Earlier session entries without duration are not backfilled.

Whisper recordings request its model-specific DTW alignment where supported, including the Turbo preset. Parakeet exposes native token timestamps through the app's pinned CLI adapter. Both are estimates rather than exact word boundaries. Closing punctuation can be emitted late; it attaches to the preceding text without extending speech into silence.

Parakeet partitions normalized audio inside detector-estimated gaps of at least five seconds. This mitigates a reproduced native failure where speech after a long pause was silently omitted. Every audio sample is retained, including sound the detector may have missed; gaps select boundaries rather than removing audio. All pieces are decoded in one native batch, and token times are shifted back onto the original recording clock. Long gaps remain in the transcript metadata. JSON exports include `recognitionChunks` for auditing. If speech detection is unavailable, recognition falls back to the full input with a warning that the pause mitigation could not run. This does not resolve every kind of native omission.

Silero speech detection and quiet-level measurements estimate gaps independently of recognition. They do not remove samples or change the recording clock. Recognition remains visible where detectors disagree. Invalid or incomplete token alignment preserves the full text with a warning instead of inventing timestamps. Long pauses are context, not evidence of thinking time.

## Development and packaging

The Windows release includes the local engines. Source builds must stage the pinned transcribe.cpp v0.4.1 token-JSON adapter, version marker and license notices before packaging. Stock CLI segment output is not a replacement for this adapter. See [Development](development.md#dependencies-and-native-setup) for native commands and smoke-harness limits, [Architecture](architecture.md#packaged-runtime-layout-and-limits) for resource/profile behavior, and [Releasing](releasing.md) for validation. Runtime binaries and downloaded weights remain ignored local artifacts.

## Attribution and compatibility

Whisper weights/code are MIT licensed. Parakeet v3 is developed by NVIDIA under CC-BY-4.0; this app uses the GGUF conversion published by handy-computer. The app retains runtime notices and identifies the source and conversion in its catalog. See the [NVIDIA model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) and [runtime source](https://github.com/handy-computer/transcribe.cpp/tree/v0.4.1).

Library discovery requires the catalog's expected byte count; selected weights also undergo hash verification. An older, corrupt or partial artifact is not usable simply because its filename matches. Download the pinned replacement through Models rather than bypassing verification. Model deletion is an explicit user action; failed replacement downloads do not publish partial weights over an existing file.
