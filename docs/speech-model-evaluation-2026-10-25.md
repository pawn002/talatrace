# Local model evaluation — 25 October 2026

Completed an automated reference-transcript evaluation through the app's real transcription service. No user recordings, manual reference transcription or cloud recognition were needed. The harness and preparation commands are documented in [Automated local speech evaluation](speech-model-evaluation.md).

## Clean-speech baseline

Twelve LibriSpeech test-clean utterances from twelve speakers (six female, six male), 99.93 seconds of speech and 265 normalized reference words. All models received identical audio, automatic language selection, four threads, alignment and speech/quiet metadata enabled.

Hardware: Intel Core i7-1260P, 16 logical CPUs, approximately 16 GB RAM, Windows x64. Whisper diagnostics confirm Intel Vulkan use; Parakeet uses the app's auto backend with its Vulkan-enabled transcribe.cpp runtime. These are service processing times for WAV input, not microphone-to-copy latencies or model-only inference speeds.

| Model | Word errors | WER ↓ | Total processing ↓ | Audio / processing ↑ |
| --- | ---: | ---: | ---: | ---: |
| Whisper Tiny | 13 / 265 | 4.91% | 22.62 s | 4.42× |
| Whisper Base | 10 / 265 | 3.77% | 29.60 s | 3.38× |
| Whisper Small | 10 / 265 | 3.77% | 56.32 s | 1.77× |
| Whisper Medium | 3 / 265 | 1.13% | 122.14 s | 0.82× |
| Whisper Turbo Q5 | 3 / 265 | 1.13% | 92.15 s | 1.08× |
| Parakeet v3 Q8 | 5 / 265 | 1.89% | 28.42 s | 3.52× |

The same clean audio took 3.24 times as long with Turbo as with Parakeet. Base matched Small's word-error count with roughly half the processing time. The two-error difference between Parakeet and Turbo/Medium is too small to support a broad quality ranking. Several errors are spelling conventions: `rebuk'd` versus `rebuked`, `color` versus `colour`, and rare literary spellings. The scorer intentionally retains these differences.

Whisper Large was skipped: no complete installed artifact was available. Every evaluated model passed the catalog's SHA-256 check. No models were downloaded or replaced.

## Stress tests and the important finding

The main run contained 138 successful jobs: six models, each with 12 clean clips, three 10 dB white-noise variants, three midpoint-inserted 30-second pauses, two speech-free clips and three repeated clean runs. There were no job failures, alignment warnings or speech-detector warnings.

- On the three noise variants (61 reference words), Turbo, Medium and Parakeet each made one word error. Base made six, Small five and Tiny thirteen. These are only three paired examples, not independent evidence of general noise robustness.
- Whisper Small generated a long repetitive passage in one midpoint-pause clip. Its pause-condition WER exceeded 100% because insertions can outnumber the reference words. A midpoint cut can split a word, so this is a stress case rather than a natural interview simulation.
- On digital silence, Small and Medium emitted `you`; Turbo emitted `Thank you.` On quiet noise, Turbo also emitted `Thank you.` Tiny/Base mostly emitted non-speech markers such as `[BLANK_AUDIO]`; Parakeet emitted empty text for both speech-free clips. Markers and invented speech must be distinguished when interpreting the raw insertion counts.

A separate control eliminates the midpoint-cut concern: two **complete utterances from the same speaker**, containing 35 reference words, with either a one-second or 30-second gap. Small, Turbo and Parakeet all scored zero errors with the short gap. With the long gap, Small and Turbo still scored zero; **the current Parakeet app path omitted the entire 14-word continuation**, producing 40% WER. Three additional runs of that long-gap input reproduced the same 14 deletions every time. This is a recognition-content failure despite a successful job and available timing metadata. The fixture does not yet isolate whether the cause lies in the model, native runtime or app integration.

For this app's pause-rich interview use, investigating that omitted continuation takes priority over replacing quality badges with a simplistic ranking. Do not promote Parakeet as the preferred interview model solely from its clean-speech speed. Turbo provides a useful comparison point, while speech-free hallucinations remain a separate behavior to track. The default model is unchanged.

### Native isolation follow-up

Ran the same complete-utterance pair directly through the shipped Parakeet CLI, bypassing the app's conversion, VAD and transcript parser. Both the auto backend (diagnostics confirm Vulkan) and strict CPU transcribed the one-second-gap input completely and omitted the second sentence on the 30-second-gap input. The omission is already present in the raw JSONL `text`. This rules out our Angular UI/parser and a Vulkan-only failure as the cause of this reproduction. It does not distinguish the underlying model, quantized conversion, runtime decoder or shipped CLI adapter. Raw output and native diagnostics are retained under `benchmarks/results/parakeet-native-isolation/`.

Next: compare token timing enabled/disabled and the pinned runtime against upstream fixes using this same fixture. If a runtime fix is unavailable, test partitioning the audio inside long detected gaps, retaining every audio sample and mapping chunk-relative token times back to the original timeline. Verify the exact missing continuation and silence behavior before expanding the corpus. Keep this separate from suppressing hallucinations or deleting recognition text based on VAD disagreement.

### Implemented pause mitigation

Disabling timestamps did not change the native omission. The latest published upstream release remained v0.4.1, and [upstream issue #71](https://github.com/handy-computer/transcribe.cpp/issues/71) reports a similar open omission problem. This is related evidence, not proof that every reported omission has the same cause.

The app now partitions normalized PCM inside detector-estimated gaps of at least five seconds. It inserts at least a midpoint boundary; longer gaps receive enough boundaries to keep the quiet portions of each partition at most 15 seconds. No samples are removed, including any faint speech or sound the detector labelled incorrectly. The original samples appear exactly once across contiguous pieces, submitted through one native batch. Recognition text is concatenated in file order and token times are shifted by each piece's original start time. Missing/out-of-order/failed batch results are errors, and malformed timings preserve the full recognized text with a warning. Existing detector results are reused; file workflows obtain them when needed. Detector failure uses the original full-input path with an explicit warning.

The original complete-utterance control now has **zero word errors with both the one-second and 30-second gaps**. The continuation begins at approximately 36.96 seconds on the original clock, and the detector's original 6.91–37.35-second pause remains in the result. A native regression gate checks the actual output, timeline and coverage; it rejects the saved defective baseline and passes the new result.

Re-ran the entire 23-job Parakeet baseline with the mitigation:

| Condition | Before | After |
| --- | ---: | ---: |
| Clean speech | 5 / 265 errors | 5 / 265 errors |
| Three midpoint-pause clips | 24 / 61 errors | 2 / 61 errors |
| Three noisy clips | 1 / 61 errors | 1 / 61 errors |
| Silence / noise-only | Empty / empty | Empty / empty |

The remaining midpoint-pause errors include recognition near an artificially split word; this is not presented as perfect detection or transcription. No complete continuation is omitted in the controlled sentence-boundary test. Long-gap partitioning is a mitigation for the reproduced case, not a guarantee against the upstream family's other context-sensitive omissions. The shipped native model/runtime and default model selection remain unchanged.

Post-change artifacts: `benchmarks/results/parakeet-partitioned-baseline/` and `benchmarks/results/parakeet-partitioned-boundary/`. All 35 Electron tests pass, including byte-for-byte PCM preservation, boundary planning, shifted timing, failed/missing batch rows and text preservation on timing disagreement. Offline fake-microphone smokes pass recording, timed Copy, file import and repeat recording for both Parakeet and Whisper Base with HTTP(S) blocked. No frontend widgets were changed for this mitigation.

## Artifacts and reproducibility

- Main results: `benchmarks/results/librispeech-12-2026-10-25/results.json` and `summary.md`.
- Complete-utterance control: `benchmarks/results/librispeech-boundary-2026-10-25/`.
- Three repeat confirmations: `benchmarks/results/librispeech-boundary-repeat-2026-10-25/`.
- Fixtures: `benchmarks/cache/librispeech-12/manifest.json` and `boundary-manifest.json`; preparation recreates both automatically.
- Raw predictions, references, S/D/I counts, segments, VAD gaps, model/clip/binary/service hashes, runtime provenance, options and diagnostics are retained in the ignored local artifacts.
- All 29 Electron tests pass, including three scorer tests. An initial sandboxed run denied an existing temporary-file rename test; the native rerun passed unchanged.

This is a small English reading baseline, not a full LibriSpeech benchmark or a general accuracy claim about interview speech, accents, technical names or other languages. The normalization differs from some published benchmarks, and speed includes app overhead with uncontrolled OS/shader caches. Future expanded and conversational evaluations can be run by the agent through the same harness, without asking the user to supply labelled recordings.

Source audio/text: [LibriSpeech / OpenSLR 12](https://www.openslr.org/12/), Vassil Panayotov, Guoguo Chen, Daniel Povey and Sanjeev Khudanpur, 2015, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Synthetic modifications are identified in the manifests.

## Large v3 follow-up and model-table badges

The user's subsequent download replaced the 15-byte HTTP error body with the complete 3,095,033,483-byte Large v3 artifact. The evaluator verified SHA-256 `64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2` before running the same twelve clean clips and four-thread recording-metadata configuration. All twelve jobs completed: **2 / 265 word errors (0.75%)**, **204.74 seconds processing for 99.93 seconds audio (0.49× real time)**. The two remaining mismatches are retained in the raw results for review. This was a separate later run, with uncontrolled background load and cache state; it is not a statistically controlled speed ranking.

The current `large` preset uses segment-level timestamps, not DTW word alignment, and reports that limitation. Its model-table description now makes this distinction visible. Source artifacts: `benchmarks/results/large-reference-2026-10-25/`. The run uses the clean-only projection of the original manifest, without new noise/pause/repeat tests; no claims about Large's long-pause behavior follow from this run.

The Models table now displays neutral, named numeric badges for all seven reference-tested models. Speed is rounded to one decimal in multiples of real time; word error rate is rounded to one decimal percent. The table identifies the English reference test, connects it programmatically to the visible benchmark context, and states the sample, hardware and interpretation limits. Large displays **0.5× real time / 0.8% errors**. Missing future reference data displays "Not measured", rather than an invented grade. The reference measurements are versioned in `electron/services/model-benchmarks.ts`; they are not measurements of whichever device subsequently runs the app.
