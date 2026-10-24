# UI quality

For UI work, inspect the rendered app before editing and state the concrete visual problems. A passing build is not a visual review.

For redesigns, make at least three meaningful render–inspect–refine passes before handing off. Inspect screenshots with the image viewer; do not merely generate them. Use `npm run preview:workflow` to render the real built app with isolated local fixtures. Review ready, recording, processing, completed, copied, failure/retry, and file-import states. Check desktop, short windows, 360/480px widths, light/dark themes, keyboard focus, and zoom. Address issues found in the screenshots before delivery.

Preserve stable Record/Stop/Copy locations, numbered workflow sequencing, separate recording/file subtabs, whole-second live duration, and millisecond final duration. Keep audio processing local. Timing metadata is approximate context; do not optimize for perfect detection at the expense of the workflow.

Report what was visually checked and any material gaps honestly. Do not equate visual polish or sampled contrast checks with a complete accessibility conformance audit.
