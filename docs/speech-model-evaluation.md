# Automated local speech evaluation

The evaluation runs without asking a user to record or hand-transcribe audio. It uses public audio with supplied reference text, then scores the app's output automatically. It is a small local baseline, not a certification or a full published benchmark.

## Run

On the current Windows development setup, with Python 3, FFmpeg and the native engines already built:

```powershell
npm run eval:speech:prepare
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run eval:speech
```

Preparation downloads the approximately 346 MB LibriSpeech test-clean archive if absent, verifies the [OpenSLR published checksum](https://www.openslr.org/resources/12/md5sum.txt), and creates a deterministic subset. Audio stays in ignored `benchmarks/cache/`. To select a larger even number of speakers, pass `-- --count 40` to preparation, then pass the matching manifest path to evaluation.

The evaluation uses installed model files only: it verifies their SHA-256 hashes against the app catalog and exposes them through hard links in an isolated profile. It skips incomplete/missing models, never downloads weights, and does not open the app window, microphone or user history. HTTP(S) is blocked in the Electron session and Node downloader. All recognition runs locally. Avoid heavy workloads during speed measurement; background load and cache state are not controlled.

Each run writes `results.json`, `summary.md` and native diagnostics to an ignored timestamped directory under `benchmarks/results/`. Optional positional arguments select a manifest and a new output directory:

```powershell
npm run eval:speech -- benchmarks/cache/librispeech-12/manifest.json benchmarks/results/my-new-run
```

An output directory containing model links from a previous run should not be reused. Model lookup checks `SPEECH_EVAL_MODELS`, the original Electron user profile, the Windows Whisper app profile and repository `models/`, accepting only complete artifacts with the expected hash.

Preparation also creates `boundary-manifest.json`: two complete utterances from the same speaker with either a one-second or 30-second gap. This checks pause behavior without cutting a word in half. To run a focused control:

```powershell
$env:SPEECH_EVAL_ONLY = 'small,large-v3-turbo-q5_0,parakeet-tdt-0.6b-v3'
$env:SPEECH_EVAL_REPEATS = '0'
npm run eval:speech -- benchmarks/cache/librispeech-12/boundary-manifest.json
Remove-Item Env:SPEECH_EVAL_ONLY,Env:SPEECH_EVAL_REPEATS
```

These optional variables filter catalog model IDs and set repeat count (0–10). Omit them for all complete installed models and three repeats.

After a focused Parakeet boundary evaluation, gate its actual output with:

```powershell
node tests/electron/parakeet-pause-regression.cjs benchmarks/results/my-boundary-run/results.json
```

This checks complete reference recognition, the continuation's original-clock timing, retained pause metadata and continuous coverage of the audio by the partitions. It rejects the original unpartitioned failure. Use the boundary manifest and include Parakeet when producing that result directory.

## Corpus and measurements

The default selection contains one 14–30-word utterance from each of 12 distinct speakers, six female and six male according to corpus metadata. Speakers and utterances are chosen by a fixed SHA-256 ordering, before looking at recognition results. Three of those utterances also have a 30-second gap inserted midway and an independent additive white-noise variant at 10 dB signal-to-noise ratio. Two 30-second speech-free clips contain digital silence or quiet white noise. Three repeats of the first clean clip expose repeated-run latency. Noise/pause variants reuse source utterances and are not independent samples.

The runner calls the real `TranscriptionService.processAudio` with the recording workflow's four threads, automatic language, JSON, token alignment and quiet/speech detection enabled. Input is lossless mono 16 kHz WAV: microphone capture, browser WebM encoding and recording-file persistence are outside this measurement. Processing time includes the service's duration decoding, preprocessing, VAD, model loading, recognition, alignment and scheduling delay. Each transcription starts a new CLI process, as the app does; OS and shader caches are not flushed. The three later repeats are not persistent-model inference timings.

Word error rate is `(substitutions + deletions + insertions) / reference words`, summed across a condition before division. Normalization applies Unicode NFKC, lowercase, apostrophe removal, punctuation-to-space and whitespace collapse. It does not expand numbers, equate synonyms or use an LLM to excuse errors. Consequently, these WERs should only be compared within this run, not directly with publications using other normalization rules. Individual references, hypotheses and error counts are retained for auditing. Speech-free clips report inserted words instead of an undefined WER. Timing and VAD output are retained but are not a word-boundary accuracy score.

Speech-free insertion counts include emitted non-speech annotations such as `[BLANK_AUDIO]` or `[silence]`. Inspect the retained text to distinguish those from invented speech; the count alone is not a hallucinated-speech score.

Artifacts record corpus/clip/model hashes, model revisions, native binary and service hashes, runtime version, hardware, thread count, options, warnings and failures. Failing clips remain visible in summaries rather than disappearing from the denominator unnoticed. Model links are removed after the run; original weights remain untouched.

## Interpretation

Read English is useful for reproducible comparison but does not establish accuracy on spontaneous interview answers, accents, technical names, children or other languages. Synthetic white noise is not a substitute for room recordings. A single short subset has high uncertainty and must not be turned into a universal model ranking. Published model evidence can supplement this baseline, with its dataset and hardware clearly stated.

For a stronger second pass, use a larger deterministic test-clean subset and test-other, then a reference-labelled conversational corpus. Those can be acquired and scored by the agent through the same harness; user transcription work is not required.

## Attribution

Source: [LibriSpeech / OpenSLR 12](https://www.openslr.org/12/), Vassil Panayotov, Guoguo Chen, Daniel Povey and Sanjeev Khudanpur, *LibriSpeech: An ASR corpus based on public domain audio books* (2015). Corpus audio, reference text and metadata are licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Noise and pause variants are modifications generated by `scripts/prepare-speech-eval.py`; original references are retained. The archive is not redistributed in this repository.
