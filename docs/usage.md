# Use TalaTrace

These instructions describe 1.2.0 on Windows. Audio recognition runs locally. Initial model downloads need a network connection; the released app does not send audio to a cloud transcription service.

## First use

Launch the installed **TalaTrace** shortcut. Open **Models** and download a speech model if the library is empty. Open **Transcription settings** in the workflow footer, beside **Include timing and pauses**, to choose an installed model and language. Changes apply immediately; **Done**, Escape or the close button dismisses the dialog.

The selected model is remembered between sessions. If it becomes unavailable, the app selects an installed fallback. The header's labelled sun, moon and monitor controls choose light, dark or system appearance; that preference is saved locally too.

## Record an answer

1. Open **Transcription → Record audio**, then **Record answer**. Allow microphone access in Windows if requested.
2. The status and header badge identify recording. The duration uses whole seconds while recording. The frequency bars beneath **Stop & transcribe** reflect the same captured microphone stream; quiet input may leave the bars empty while the Recording status stays visible.
3. Select **Stop & transcribe**. Capture stops, the microphone is released and local transcription begins. The final recording duration includes milliseconds and excludes processing time.
4. When the transcript is ready, use **Copy transcript** or **Save transcript…**. Choose **Record another** to begin the next answer.

Record, Stop and Copy keep stable locations and remain visible when disabled. Nearby guidance explains what is needed next. A failed transcription retains the recording in memory and offers **Retry transcription**. Starting a new recording successfully replaces it; closing the app loses the retained copy. There is no Discard recording button.

Capture is limited to 30 minutes and 64 MiB. The app stops at the time limit; exceeding the byte limit discards that capture and reports an error. Temporary recording files are cleaned after processing; crash leftovers older than 24 hours are cleaned at startup. Keep any transcript you need by copying or saving it.

## Transcribe an audio file

1. Open **Transcription → Audio file**.
2. Use **Choose audio file…**; the chosen name and size appear beneath the button.
3. Adjust the model/language in **Transcription settings** if needed, then select **Transcribe file**.
4. Copy or save the result. **Choose another file…** starts another round.

The picker accepts MP3, WAV, OGG, FLAC, M4A, AAC and WebM; decoding still depends on FFmpeg accepting the actual file. Imported files are limited to 500 MiB. Each source subtab retains its own input/result during the session. Source switching is guarded during capture, file selection and transcription. Arrow keys, Home and End navigate a focused subtab set.

Whisper file imports use the existing segment-timing path rather than the recording workflow's aligned speech/pause analysis. Parakeet returns token timings and may partition around detected gaps to protect recognition. Do not expect imported files to contain the same pause metadata as new microphone recordings.

## Read, copy and save

The transcript is a read-only output, not an editor. Edit the copied or saved text in your preferred application.

**Include timing and pauses** controls Copy and TXT content. With it enabled, available speech timestamps and pause metadata are formatted as a readable timeline; with it disabled, Copy/TXT contain the recognized words. **Save transcript…** opens the system save dialog:

In the development/Linux testing build, first choose **File format** beside **Save transcript…**. The app supplies that extension and remembers the last successful export folder/name for the current session. An explicitly typed TXT/SRT/VTT/JSON extension takes precedence and selects that format. If the suffix is missing, the app appends the selected extension and confirms before replacing an existing file at that changed destination. Unchanged names rely on the native picker's confirmation. Empty subtitle exports are blocked; useful TXT timing context and JSON diagnostics remain available. Released Windows 1.2.0 uses the earlier filename-based selection.

The development/Linux testing build also provides **Notification preferences** through the header gear: success/info messages dismiss after 5, 10 (default) or 30 seconds, or **Never**. Timers pause on hover/focus, while preferences are open and while the app is inactive. Warnings/errors stay until dismissed. The preference is saved locally. Ctrl+/Ctrl−/Ctrl+0 enlarge, reduce and reset the interface; the native desktop scale is independent of this zoom.

| Format | Content |
| --- | --- |
| TXT | Same current readable/plain text as Copy |
| SRT / VTT | Recognized speech segments for subtitles; not the full pause-analysis report |
| JSON | Structured recognition, timing, duration, processing and available diagnostic metadata |

Expand **Transcript details** in the transcript card footer for the completed result's model, audio length, processing time and speed, plus timing/pause explanations and available original measurements. Those facts describe the result, even if you subsequently change the selected model. Warnings remain visible above the transcript.

Example recording timeline:

```text
[00:00:03.200 → 00:00:08.700] I initially thought we could meet the deadline.
[00:00:08.900 → 00:00:12.900] No speech detected (4.0 s)
[00:00:13.100 → 00:00:19.400] Then we discovered the requirements were incomplete.
```

Speech times are estimates relative to the original audio clock. A local speech detector labels gaps of at least 1.5 seconds for the recording workflow. Background sound may remain, faint speech can be missed and recognized text is retained where detectors disagree. Gaps do not establish thinking time. If speech detection fails, a visible warning explains the volume-based fallback. See [Models](models.md#timing-and-pauses) for alignment and Parakeet's lossless partitioning.

## Models and history

The **Models** table offers Download for missing models and Delete for installed ones. Downloads are verified before publication. Deletion is guarded while transcription or a relevant download is active. After downloading, choose the model in settings; downloading alone does not switch an already usable selection. See [Models](models.md) for implemented model identities and reference-test limits.

**History** contains completed transcriptions from the current app session (up to 50). It is not a persistent archive. Columns show file, model, status, audio duration, processing time and date. Use the column headings to sort; Enter/Space work on focused headings. Missing numeric values sort last. Refresh reloads the current session's list; it does not recover earlier sessions. A row's **Copy** action copies its recognition text, without the workflow's formatted timing/pause report.
