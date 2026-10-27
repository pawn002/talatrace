# Prior art review: continue, pivot, or retire

> Historical record from October 2026. Earlier findings, commands and verification claims may be superseded. Use the [current documentation index](../README.md), [current widget inventory](../candor-widget-review.md) and [documentation audit](../../AUDIT_REPORT.md) for present behavior and known test-harness limits.

Review date: October 23, 2026. Related issues: #16 (comparison), #22 (recording), #20 (model readiness), #21 (design tokens).

## Decision status

The user approved a focused interview-recording implementation after trying Handy, Buzz, and OpenWhispr. Handy met quick dictation needs. Buzz's live mode lacked timestamps; OpenWhispr's tested timestamped workflow required too many steps and offered SRT rather than the desired directly reusable text. Continue this app around **Record → Stop → Copy readable timestamps**, with local processing and quiet-interval context. This is a focused pivot, not a claim that all competing tools lack these capabilities.

This is a source-based first pass, not an installation test, performance benchmark, or privacy audit. Features described on upstream main branches may differ from released installers. Record installer versions and model choices during trials before making a decision.

## User requirements

- Record speech and obtain text without using a separate recorder or manually importing each recording.
- Keep voice recordings and transcription processing on the device. Downloading models during setup is acceptable; ongoing audio upload is not.
- Copy text into AI chats and TUIs; direct insertion is useful only when reliable and predictable. Never automatically submit a prompt or execute dictated commands.
- Preserve the ability to transcribe existing audio files, either in the same tool or through an acceptable companion tool.
- Work well on the user's Windows machine. Test CPU and Intel integrated GPU behavior where supported, rather than assuming NVIDIA hardware.
- Reduce recurring effort, including setup, model management, recovery from failures, and software maintenance.

## Shortlist and documented overlap

| Project | Documented capabilities | Evaluation role |
| --- | --- | --- |
| [Handy](https://github.com/cjpais/Handy) | Local dictation; configurable hold/toggle shortcuts; insertion into focused applications; Whisper and Parakeet; Windows/macOS/Linux; CLI control of a running instance. | First candidate for replacing the requested voice-to-chat/TUI workflow. Existing-file workflow and clipboard-only behavior need verification. |
| [Buzz](https://github.com/chidiwilliams/buzz) | Offline microphone and audio/video-file transcription; TXT/SRT/VTT export; multiple backends; whisper.cpp Vulkan including integrated GPUs; CLI and watch-folder workflows. | First candidate for replacing this app's existing file-transcription role as well as microphone transcription. Test short-dictation friction. |
| [OpenWhispr](https://github.com/OpenWhispr/openwhispr) | Global-hotkey dictation and automatic paste; file import; local Whisper/Parakeet and other models; local Vulkan support; optional cloud processing and broader AI/meeting features. | Candidate for one application covering both workflows. Verify local configuration, network behavior, and complexity of setup. |

Primary sources inspected:

- [Handy README](https://github.com/cjpais/Handy/blob/main/README.md).
- [Buzz README](https://github.com/chidiwilliams/buzz/blob/main/README.md).
- [OpenWhispr README](https://github.com/OpenWhispr/openwhispr/blob/main/README.md).

Upstream privacy statements are claims, not independent verification. Optional cloud/AI processing must be explicitly distinguished from local transcription during testing.

## Position of this app

The current app provides local file transcription using Angular, Electron, bundled FFmpeg, and whisper.cpp; model downloads; transcript copy/export; and in-memory history. It has no microphone capture or global dictation controls. Its documentation describes Windows Intel Iris Xe Vulkan acceleration, but Buzz and OpenWhispr also document Vulkan support. Local processing and integrated-GPU support therefore do not establish a unique product advantage by themselves.

Known maintenance work includes model-download correctness (#20), the Candor major-version migration (#21), and recording lifecycle/permission/temp-file work if #22 proceeds. Do not incur those costs solely to match a replacement that already meets the requirements.

## Practical replacement trial

Start with Handy and Buzz. Evaluate OpenWhispr if neither provides an acceptable replacement or if a single combined tool remains important.

For each candidate, record the release/version, installer source, model/version, backend, hardware, and settings. Test:

1. Setup and model installation, including recovery from interrupted downloads.
2. Ten short dictated responses, including technical vocabulary, paths, punctuation, and multiline prompts. Measure time from finishing speech to usable text and correction effort.
3. A longer spoken response, silence, discard/cancel, and repeated start/stop cycles. Verify recordings are recoverable after transcription failure where supported.
4. Clipboard and insertion into an AI chat, Windows Terminal, and the user's actual TUI. Check focus, newlines, shortcut conflicts, and accidental submission; prefer explicit paste if insertion is unreliable.
5. Existing-file transcription and required export formats using the same sample audio as this app. Compare accuracy and processing time under comparable model/backend settings where possible.
6. With models installed, run recording and transcription while networking is disabled. Separately inspect outbound connections during a connected local-mode run; offline success alone does not establish that connected operation avoids upload.
7. Inspect audio/transcript retention, deletion controls, logs, and temporary files. Confirm that local storage defaults fit the user's expectations.
8. Restart, unavailable microphone, permission denial, and model failure. Record the work needed to recover.

Trial setup: Handy 0.9.8 was installed through Windows Package Manager (`cjpais.Handy`) and launched. Package Manager verified installer hashes and installed the Vulkan runtime dependency. The Handy window was detected, but computer-use app approval timed out before onboarding could be inspected. Model choice, shortcut configuration, recording, accuracy, performance, and privacy behavior remain untested. This is setup evidence only, not a successful dictation test.

Do not treat untested fields as failures or infer absent features from README omissions.

### Follow-up trial observations (October 24, 2026)

- The user successfully dictated into Codex using Handy. Accuracy/usefulness were positive in the initial trial; a little lag behind real time was acceptable. Timestamped interview transcripts remain a separate requirement: timing and long pauses can add context for analysis. Handy's tested dictation output did not include timestamps; other Handy capabilities have not been exhaustively checked.
- Buzz 1.4.4 was installed through the Windows Package Manager manifest's official SourceForge package. The archive SHA-256 matched the manifest, and installation completed successfully. A running process did not establish successful startup: the user subsequently reported a fatal missing `setuptools/_vendor/jaraco/text/Lorem ipsum.txt` resource.
- Local troubleshooting restored that original text resource from a checksum-verified jaraco.text 3.12.1 wheel, three scikit-learn 1.7.2 HTML display resources (estimator.css, estimator.js, params.css; version matched Buzz's release lockfile), and two original PyTorch 2.8.0 configuration source files (fx/experimental/_config.py and compiler/config.py) required by startup introspection. These additions passed earlier errors but exposed missing regex distribution metadata. Buzz 1.4.4 remains unqualified for functional testing; this is a packaging/setup failure, not an assessment of transcription quality.
- The official GitHub releases list Buzz 1.4.5 as newer than the package-manager version. Downloaded its three Windows installer files and verified each SHA-256 against GitHub release asset digests. Removed the six temporary repair additions listed above, closed failed instances, and upgraded through the official installer (exit code 0; no restart needed). Confirmed the visible Buzz main interface exposes Record and New File Transcription controls, with no startup exception. Audio recording/transcription is still untested. Source: https://github.com/chidiwilliams/buzz/releases/tag/v1.4.5.
- Buzz 1.4.5 startup logs report failure to install the optional deep_filter_net plugin because its dependency build needs Rust/Cargo in the detected Python 3.13 environment; this did not prevent the main interface opening. Logs also show a successful POST to a PostHog telemetry endpoint. Request payload was not inspected; this observation does not establish audio upload. Evaluate telemetry controls and local transcription network behavior before considering the privacy requirement satisfied.
- Buzz's live-microphone test used Whisper Tiny with automatic language detection and produced heavily garbled plain text. More importantly, the user found no timestamp controls. Documentation and v1.4.5 source confirm that live recording disables Whisper timestamps and exports text (TXT/CSV), while timestamped SRT/VTT and word timings belong to file transcription. Live recording fails the required timing workflow; do not spend effort tuning model accuracy for this trial. Sources: https://github.com/chidiwilliams/buzz/blob/v1.4.5/buzz/transcriber/recording_transcriber.py and https://github.com/chidiwilliams/buzz/blob/v1.4.5/buzz/widgets/recording_transcriber_widget.py.
- Next candidate: OpenWhispr 1.10.4. Official documentation describes starting meeting-mode recordings manually for interviews, local processing options, and transcript export; release history documents SRT/JSON/TXT export. The v1.10.4 meeting recording store carries transcript segment start/end times. This passes initial screening only: confirm that the local microphone path produces usable speech timing and exports it faithfully, without cloud audio processing, before judging it a replacement. Do not equate timed meeting segments with accurate pause measurement. Sources: https://docs.openwhispr.com/help/meetings/record-a-meeting, https://docs.openwhispr.com/guides/cloud-vs-local, https://openwhispr.com/changelog, and https://github.com/OpenWhispr/openwhispr/blob/v1.10.4/src/stores/meetingRecordingStore.ts. Not installed or tested yet.

## Decision rules

OpenWhispr installation update: installed official Windows release 1.10.4 after verifying the installer SHA-256 against the GitHub release asset digest. Installer exited successfully. Confirmed the visible welcome screen, including a Continue without an account option. Onboarding, local model selection, recording, and timestamped exports remain untested.

- **Retire:** One replacement, or an acceptable pair, handles the actual workflows with suitable privacy, accuracy, responsiveness, and recovery. Keep existing source/releases accessible and document the replacement path; archive only after an explicit decision.
- **Contribute upstream:** A replacement is close and the remaining gap is small enough to fix or document upstream. Check maintainers' scope and contribution guidance before proposing changes.
- **Pivot:** Testing demonstrates a recurring unmet need with enough value to justify maintenance. Possible areas to investigate include explicit review before text insertion, a terminal-friendly output workflow, or simpler local-file handling. These are hypotheses, not established gaps in competing tools.
- **Continue:** A requirement remains unmet and this app has a credible, maintainable advantage. Document the evidence before implementing recording.

Recommendation from the first pass: evaluate adoption before extending this app. Handy is the leading dictation candidate; Buzz is the leading file-transcription replacement candidate. Retirement is a reasonable possible outcome, contingent on the practical trial.
