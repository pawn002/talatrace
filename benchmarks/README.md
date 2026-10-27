# Local measurement tools

There are two different measurement paths. Neither establishes universal model quality or speed.

## Current speech-model evaluation

Use [Automated local speech evaluation](../docs/speech-model-evaluation.md) to compare the app's real Whisper/Parakeet service against known reference text. It measures word error rate and total service processing, including the recording workflow's timing/pause options. Corpus/preparation/results stay under ignored `benchmarks/cache/` and `benchmarks/results/`.

The [25 October results](../docs/archive/speech-model-evaluation-2026-10-25.md) are dated evidence behind the UI's reference columns. They are not a prediction for the current device or a ranking across all languages/recording conditions.

## Raw Whisper variant benchmark

`npm run benchmark` runs `scripts/benchmark-variants.js` with `configs/benchmark-config.json`. It directly spawns Whisper CLI binaries; it does not exercise the renderer, microphone, job service, Parakeet or the full timing/pause pipeline.

Current default configuration:

- Variants: **baseline** and **vulkan**.
- Models: Tiny and Base from repository `models/`, not automatically from the app profile.
- Threads: 1, 4 and 8; one warm-up and three measured runs per combination.
- Audio: repository Whisper JFK sample copied to `benchmarks/audio-samples/test-sample.wav`; duration/word count are configured assumptions.

Build scripts can produce other variants, but SYCL, OpenVINO and AVX-512 experiments are not engines selected by the released app's UI. Do not infer that a build option is validated product support or repeat old hypothetical speedup tables as measurements.

```powershell
npm run system-info
npm run build:whisper-baseline
# With the required SDK/toolchain available:
node scripts/build-whisper-variants.js --variant=vulkan
npm run benchmark
```

The benchmark discovers `whisper.cpp/build-<variant>/bin/Release/whisper-cli.exe` or `bin/whisper-cli.exe` on Windows, with corresponding non-Windows executable names. It does not read the old `whisper-bins/` layout. See [Development](../docs/development.md) for native setup and its platform limits.

Reports are timestamped JSON/CSV under ignored `benchmarks/results/`. Preserve hardware, power/load conditions, native build options, model identity and repeat variation when interpreting them. The RTF here is **processing/audio** (lower is faster), while the app's reference speed is **audio/processing** (higher is faster). Do not compare those values without taking the reciprocal.

`firstTokenTime` is only time to the first stdout chunk, not verified decoder-token latency. Words/second uses the configured expected word count, not recognized words or WER. Missing/failed native variants and stale duration assumptions can invalidate comparisons. CLI runs can create output sidecars beside the sample. Use the service evaluation for the app's current cross-model evidence.
