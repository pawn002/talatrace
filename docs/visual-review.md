# Visual review — 24 October 2026

## Baseline critique

The prototype spent too much space on repeated headings, empty status areas and oversized stacked controls. Disabled buttons lost their visible boundaries. Step labels and arrows felt detached from the actions. The transcript appeared after settings and often below the first screen. Serif text, dense interface text and monospaced labels lacked a common hierarchy. Toasts duplicated persistent status and covered useful content. A newly appearing scrollbar shifted the controls horizontally.

## Iterations

1. **Composition:** compact app shell, restrained surface hierarchy, focused task heading, grouped step cards, readable button boundaries, separate status and duration, and consistent sans-serif interface text. Removed duplicate completion/copy toasts and the implementation-oriented platform/version footer.
2. **Hierarchy:** aligned source subtabs with the heading on desktop, tightened spacing, moved advanced settings below the transcript, integrated the copy option into the secondary action row, highlighted the current step and reserved scrollbar space. The main controls retain their measured positions through ready, recording, processing and completion.
3. **States and readability:** larger timestamps, stronger secondary text, explicit processing feedback, reduced-motion treatment, inline error recovery, persistent copy confirmation, visible focus styling and keyboard navigation for the main tabs as well as the source subtabs. Main navigation is locked during active work, with recording/processing status retained in the header. Checked long filenames, narrow settings, zoom and light mode.
4. **Consistency and final audit:** aligned Models and History with the same typography and surface treatment. Reviewed empty and populated history, narrow data tables and trusted Chromium keyboard focus. The preview harness uses renderer focus emulation because its window is offscreen; it never operates the user's desktop.

## Verification

- `npm test`: 98 frontend tests and 18 Electron tests passed.
- Production frontend build passed. The existing initial-bundle warning remains; the bundle is approximately 541 kB raw / 100 kB estimated transfer. Existing Sass import deprecation warnings also remain.
- Full offline fake-microphone smoke test passed for recording, transcription, Copy, repeat/discard, file transcription and retained subtab state.
- 28 rendered cases covering ready, microphone preparation, recording, processing, reduced motion, result, copied, keyboard focus, clipboard failure, retry, file selection/processing/result, long filename, settings, Models, and empty/populated History.
- Viewports: 1100×820, 1024×680, 480×820, 360×780 and 200% zoom. Light and dark themes checked. No page-wide horizontal overflow in the captured cases; data tables may scroll within their own containers.
- Sampled rendered helper/timestamp text contrast: 7.72:1 in dark mode and 9.29:1 in light mode. Primary button text: 10.06:1 dark / 14.95:1 light. These are targeted measurements, not a complete conformance audit. Screen-reader announcement quality has not been manually tested.

The responsive workspace uses a 6 kB warning / 8 kB error component-style budget instead of the prototype's 2/4 kB limit. No UI library or remote design assets were added.

## Reproducing the visual review

Run `npm run preview:workflow`. Screenshots and layout/contrast metrics are written under the operating system's temporary directory in `whisper-visual-review/current`. Set `WHISPER_VISUAL_PASS` to keep a named pass. The harness renders the real compiled frontend with fixture IPC, synthetic microphone data, a temporary profile and network requests disabled. Use the separate interview smoke test to exercise native audio processing.

Future UI work should follow the review process in [AGENTS.md](../AGENTS.md), rather than treating successful compilation as evidence of visual quality.
