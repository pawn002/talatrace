# Usage Guide

Complete guide to using the Whisper Electron App for audio transcription.

## Table of Contents

- [Quick Start](#quick-start)
- [Transcription Workflow](#transcription-workflow)
- [Recording Interview Answers](#recording-interview-answers)
- [Model Management](#model-management)
- [History Management](#history-management)
- [Export Options](#export-options)
- [Tips and Best Practices](#tips-and-best-practices)

## Quick Start

### Launching the Application

**Development Mode** (for contributors):
```bash
npm run dev
```

**Production Mode** (end users):
- **Windows**: Double-click `Whisper Transcription.exe`
- **macOS**: Open `Whisper Transcription.app`
- **Linux**: Run `./whisper-transcription`

The application starts instantly with no delay - all processing is handled natively by Electron services.

## Recording Interview Answers

1. Open **Transcription → Record audio**. Defaults are ready to use; expand **Transcription settings** to change the model or language. If no model is installed, **Download a model** opens Models.
2. Click **Record answer** and allow microphone access when your operating system asks. The persistent status shows **Recording · microphone on**, with a whole-second timer. A live spectrogram above Stop uses the same microphone stream: higher frequencies appear toward the top, brightness reflects energy, and recent audio scrolls from right to left. Silence leaves the **Recording** label visible. With reduced motion enabled, the display uses slowly updating frequency levels without scrolling. The display stops with the microphone and never plays audio through the speakers; a display failure leaves recording usable.
3. Click **Stop & transcribe**. The microphone is released immediately and the status switches to **Transcribing · microphone off**. The final duration remains visible to milliseconds (for example, `00:30.527`), measured when Stop was pressed; processing time is excluded. FFmpeg/Whisper process the recording locally.
4. When **Your transcript is ready** appears, **Copy transcript** becomes available in its usual position. **Copied — ready to paste** confirms success; paste into your AI chat or TUI. Uncheck **Include timing and pauses** for plain text. **Save transcript…** offers TXT, SRT, VTT and JSON; TXT saves the same readable text as Copy.
5. Click **Record answer** again to start the next recording. If transcription fails, **Retry transcription** uses the retained recording; **Discard recording** lets you start over.

Record, Stop and Copy remain visible in stable positions throughout the recording workflow. Unavailable actions are disabled, and nearby guidance explains the next step. To use an existing recording, open **Transcription → Audio file**, choose **Choose audio file…**, then **Transcribe file**. Each subtab retains its own input and transcript when switching. Switching is disabled during recording, file selection, or transcription. Use Left/Right arrows, Home or End when focused on a subtab to navigate. Timing explanations and original measurements remain under **About timing and pause detection** below each preview.

Example copied answer:

```text
Timeline ordered by start time. Speech ranges use audio-aligned token locations: estimates, not exact word boundaries. No speech detected marks gaps of at least 1.5 s estimated by a local speech detector. Background sounds may remain; faint or brief speech can be missed. Recognition text is preserved even where the detectors disagree. These gaps do not establish thinking time.

[00:00:03.200 → 00:00:08.700] I initially thought we could meet the deadline.
[00:00:08.900 → 00:00:12.900] No speech detected (4.0 s)
[00:00:13.100 → 00:00:19.400] Then we discovered the requirements were incomplete.
```

Speech timestamps are estimates relative to the beginning of the recording. For microphone recordings, the bundled Whisper VAD helper runs the [Silero v5.1.2 model](https://huggingface.co/ggml-org/whisper-vad) locally, independently of transcription. Gaps between detected speech lasting at least 1.5 seconds appear as **No speech detected**, including leading and trailing gaps. Detected speech interruptions split these gaps; they are not merged across speech. Background sounds can remain, and faint or brief speech may be missed. Recognition text is retained even when it overlaps a detector gap. The detector never cuts or retimes the recording.

FFmpeg also measures audio below -35 dB for at least 1.5 seconds. Expand **Original quiet measurements** to compare these volume measurements against speech detection. JSON exports retain `speechIntervals`, `noSpeechIntervals`, `speechDetectionMethod`, the raw `quietIntervals`, and volume-based grouped `pauseRegions`. Copy/TXT use the speech gaps when detection succeeds. Plain-text copy is available by unchecking timestamps.

`npm run setup` downloads the small VAD model into `models/ggml-silero-v5.1.2.bin`; release builds bundle it and the `whisper-vad-speech-segments` helper beside Whisper's native libraries. No model downloads or audio uploads occur during speech detection. If the helper/model is missing or fails, transcription still completes with a visible warning and falls back to volume-based pause regions. These group quiet measurements separated by up to 1.5 seconds and can include brief sounds or speech. `npm run test:speech-activity` checks the Windows native detector using sample speech with steady background noise and a speech interruption.

For new microphone recordings using Tiny, Base, Small, or Medium, Whisper's local DTW pass aligns the recognized tokens back to the audio. The displayed speech ranges run from the first to the last aligned token location in each phrase, splitting at long token gaps or sentence boundaries. These are audio-based estimates, not exact word-onset/offset measurements. Timing locations come from model attention to the original audio; speech is not simply moved to the end of a detected pause. **Original recognition timestamps** remain expandable, and JSON exports retain `originalSegments` alongside the aligned `segments` and `timingMethod`.

DTW needs attention weights, so this path disables flash attention and may take longer or use more memory. It uses the selected local model without downloading an additional alignment model. The unversioned Large model alias does not identify a compatible alignment-head preset and currently retains original timing. If alignment fails or its locations are missing, non-monotonic, or inconsistent with the recognized text, the app keeps the original transcript and displays a timing warning. File-import transcription currently retains the existing segment timing path.

Quiet intervals can reflect pauses, low microphone volume, or other recording conditions; they do not establish why a person paused. This is timing context, not a psychological assessment.

Recording is limited to 30 minutes / 64 MB. If transcription fails, the captured audio stays in memory and **Retry transcription** appears; choose **Record answer** to start again instead. The retained copy is replaced after a new recording starts successfully or cleared when the app closes. Normally the secondary action row contains only **Save transcript** and the **Include timing and pauses** copy preference. Electron deletes temporary recording files after success or failure. A crash can leave temporary files; app recording folders older than 24 hours are removed at the next launch. Transcription history remains limited to the current session.

Recording and transcription do not upload voice data. Model downloads require an initial network connection. On macOS the packaged app includes a microphone usage description; permissions and device availability still need platform-specific testing.

## Transcription Workflow

### Step 1: Select Audio File

1. Navigate to the **Transcription** tab (default)
2. Click **"Select Audio File"** button
3. Browse and select your audio file

**Supported Formats:**
- MP3
- WAV
- OGG
- M4A
- FLAC
- AAC
- WEBM

**Note**: Non-WAV files are automatically converted to WAV using the bundled FFmpeg.

### Step 2: Configure Settings

After selecting a file, configure these options:

#### Model Selection

Choose the Whisper model based on your needs:

| Model  | When to Use |
|--------|-------------|
| **tiny** | Quick drafts, low-quality audio, speed priority |
| **base** | General use, good balance (recommended) |
| **small** | Better accuracy, longer processing time |
| **medium** | High accuracy needs, professional transcription |
| **large** | Best quality, subtitles, archival transcription |

**Default**: base

#### Language Selection

- **Auto Detect** (recommended) - Automatically detects the spoken language
- **Specific Language** - Choose if you know the audio language:
  - English
  - Spanish
  - French
  - German
  - Many more supported via auto-detect

**Tip**: Auto-detect works well for most cases. Select a specific language only if auto-detect fails.

### Step 3: Start Transcription

1. Click **"Start Transcription"** button
2. Progress spinner indicates processing is active
3. Wait for completion

**Processing Time Factors:**
- **Audio length** - Longer files take more time
- **Model size** - Larger models are slower but more accurate
- **Hardware** - CPU speed and available RAM affect performance

**Estimated Times** (for 1 hour of audio on mid-range PC):
- tiny: ~5-10 minutes
- base: ~10-20 minutes
- small: ~20-40 minutes
- medium: ~40-80 minutes
- large: ~80-120 minutes

### Step 4: Review Results

Once complete:

1. Transcript appears in the text editor
2. Review for accuracy
3. Edit directly in the editor if needed
4. All text is fully editable

### Step 5: Save or Copy

#### Copy to Clipboard

1. Click **"Copy"** button
2. Transcript is copied to clipboard
3. Paste anywhere you need it

#### Export to File

1. Click **"Export"** button
2. Choose file format:
   - **TXT** - Plain text, maximum compatibility
   - **JSON** - Structured data with metadata
   - **SRT** - SubRip subtitle format (includes timestamps)
   - **VTT** - WebVTT subtitle format (includes timestamps)
3. Select save location
4. Click Save

**Format Recommendations:**
- **TXT** - For general use, documents, notes
- **JSON** - For programmatic access, data analysis
- **SRT/VTT** - For video subtitles

## Model Management

### Viewing Available Models

1. Navigate to the **Models** tab
2. See all Whisper models with:
   - Model name and size
   - Download status (green checkmark = installed)
   - Download button for uninstalled models

### Downloading Models

1. Click **"Download"** button next to the desired model
2. Progress bar shows download status
3. Model is immediately available after download

**Initial Models**: The setup process downloads `tiny` and `base` models by default.

**Storage Locations:**
- Models are stored in the `models/` directory
- Downloaded from Hugging Face

**Disk Space Requirements:**
- tiny: 39 MB
- base: 74 MB
- small: 244 MB
- medium: 769 MB
- large: 1.5 GB

**Tip**: Download models while connected to Wi-Fi to avoid using mobile data.

### System Information

View platform and app version in the footer (visible from any tab).

## History Management

### Viewing Past Transcriptions

1. Navigate to the **History** tab
2. Browse all completed transcriptions
3. View metadata for each:
   - Original filename
   - Model used
   - Language detected
   - Date and time
   - Processing duration
   - Audio file length

### Copying from History

1. Find the transcription you want
2. Click **"Copy Transcript"** button
3. Toast notification confirms successful copy
4. Paste the transcript wherever needed

**Use Cases:**
- Re-use previous transcriptions
- Compare results from different models
- Access transcripts from deleted audio files

## Export Options

### Text (.txt)

**Best for:**
- General purpose use
- Copy/paste into documents
- Maximum compatibility

**Contains:**
- Plain text transcript
- No metadata or formatting

### JSON (.json)

**Best for:**
- Programmatic access
- Data analysis
- Archival with metadata

**Contains:**
```json
{
  "text": "Transcript text here...",
  "metadata": {
    "model": "base",
    "language": "en",
    "duration": "123.45"
  }
}
```

### SRT (.srt)

**Best for:**
- Video subtitles
- Most video players
- YouTube, Vimeo uploads

**Format:**
```
1
00:00:00,000 --> 00:00:05,840
First subtitle text here

2
00:00:05,840 --> 00:00:10,120
Second subtitle text here
```

**Requirements**: Transcription must include timestamps (Whisper includes them by default)

### VTT (.vtt)

**Best for:**
- Web video players
- HTML5 video
- Modern subtitle format

**Format:**
```
WEBVTT

00:00:00.000 --> 00:00:05.840
First subtitle text here

00:00:05.840 --> 00:00:10.120
Second subtitle text here
```

## Tips and Best Practices

### For Best Transcription Quality

1. **Audio Quality Matters**
   - Use high-quality recordings when possible
   - Minimize background noise
   - Ensure clear speech

2. **Choose the Right Model**
   - Start with `base` for most uses
   - Use `small` or `medium` for professional work
   - Use `tiny` only for quick drafts

3. **Language Selection**
   - Use auto-detect unless it fails
   - Specify language for heavy accents or dialects

### For Faster Processing

1. **Model Selection**
   - Use `tiny` for quick drafts
   - Use `base` for everyday work

2. **Hardware Optimization**
   - Close unnecessary applications
   - Ensure sufficient free RAM
   - Larger models benefit from more CPU cores

### For Subtitle Creation

1. **Use SRT or VTT format** for export
2. **Review timestamps** - Whisper includes them automatically
3. **Edit if needed** - Adjust timing in subtitle editing software

### File Organization

1. **Use descriptive filenames** when saving
2. **Create folders** for different projects
3. **Check History tab** before re-transcribing the same file

### Troubleshooting

If you encounter issues during use, see the [Troubleshooting Guide](troubleshooting.md).

## Advanced Features

### Keyboard Shortcuts

Currently, the app uses standard system shortcuts:
- `Ctrl+C` / `Cmd+C` - Copy selected text
- `Ctrl+V` / `Cmd+V` - Paste text
- `Ctrl+A` / `Cmd+A` - Select all text

### Batch Processing

**Not yet available** - See [project status](../README.md#-status) for planned features.

### GPU Acceleration

**Available on Windows with Intel Iris Xe** — The app automatically uses the Vulkan iGPU backend when available, providing 1.7–4x faster transcription compared to CPU-only. No configuration required.

While recording or transcribing, you can visit Models or History and return to Transcription without interrupting the operation. The header continues to show recording/transcription status. The recording/file source switch stays locked until the operation finishes; its explanation appears beneath the source tabs. Workflow hints explain when Stop, Copy and Save become available. History shows a reason beside unavailable Copy actions.

After an answer, **Record another** starts a new recording in the same workflow. Once a file is selected, **Choose another file…** lets you select the next recording; cancelling the picker keeps the current file and transcript. The transcript footer's question icon opens **About timing and pause detection**.

## Appearance

Use the three-position **Theme** control in the app header to choose **Light**, **Dark**, or **System**. Changes apply immediately. Tab into the group, then use the arrow keys to select a mode; Home and End select the first and last options. System is the default and follows the operating system, including changes while the app is open. Light and Dark override the system preference for this app. The choice is stored locally and restored on reload or restart. Theme switching is available during recording and does not interrupt capture.
