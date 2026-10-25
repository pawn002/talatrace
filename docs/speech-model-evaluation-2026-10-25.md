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

## Artifacts and reproducibility

- Main results: `benchmarks/results/librispeech-12-2026-10-25/results.json` and `summary.md`.
- Complete-utterance control: `benchmarks/results/librispeech-boundary-2026-10-25/`.
- Three repeat confirmations: `benchmarks/results/librispeech-boundary-repeat-2026-10-25/`.
- Fixtures: `benchmarks/cache/librispeech-12/manifest.json` and `boundary-manifest.json`; preparation recreates both automatically.
- Raw predictions, references, S/D/I counts, segments, VAD gaps, model/clip/binary/service hashes, runtime provenance, options and diagnostics are retained in the ignored local artifacts.
- All 29 Electron tests pass, including three scorer tests. An initial sandboxed run denied an existing temporary-file rename test; the native rerun passed unchanged.

This is a small English reading baseline, not a full LibriSpeech benchmark or a general accuracy claim about interview speech, accents, technical names or other languages. The normalization differs from some published benchmarks, and speed includes app overhead with uncontrolled OS/shader caches. Future expanded and conversational evaluations can be run by the agent through the same harness, without asking the user to supply labelled recordings.

Source audio/text: [LibriSpeech / OpenSLR 12](https://www.openslr.org/12/), Vassil Panayotov, Guoguo Chen, Daniel Povey and Sanjeev Khudanpur, 2015, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Synthetic modifications are identified in the manifests.
