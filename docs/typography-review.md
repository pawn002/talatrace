# Typography review — 25 October 2026

The implementation before this review is saved in commit `9d4c7f9`. This follow-up changes presentation only; audio capture, local engines, timing, copying and persistence are unchanged.

## Sources reviewed

Reviewed the current Storybook inventory, story documentation and construction sources for:

- [Design Tokens / Typography and Contrast Guidance](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/docs/design-tokens-typography--docs)
- [Text](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/docs/typography-text--docs)
- [AccessibleText](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/docs/typography-accessibletext--docs), including instruction/comprehension, role sizes, state vs. status, font comparisons and form context
- [Heading](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/docs/typography-heading--docs), including semantic/visual levels, optical sizing, weight and leading
- [Article](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/docs/typography-article--docs), including serif/sans contexts, font comparisons and its actual 65ch construction
- [Candor visual-design guidance](https://github.com/pawn002/candor/blob/main/docs/VISUAL-DESIGN.md), especially reading measure and type-family roles

## Findings and corrections

| Finding | Correction |
| --- | --- |
| Timing explanation and settings stretched across a roughly 1000px desktop panel. Chevrons were remote from labels; help was a wide slab of prose. | Bound the actual standalone disclosure hosts to 65ch, shrinking naturally on small screens. The enclosing card and three-step workflow retain their wider composition. |
| General help and performance data reused the instructional Atkinson class. Noto Sans was not bundled, despite its reading token being available. | Bundle Noto Sans 400 locally. Explanatory paragraphs, conversational transcript words and model-description paragraphs use the reading token. Instructions keep Atkinson with positive tracking. Performance data uses Roboto Flex. |
| Native page h2 headings used the visual h3 size and semibold; transcript h3 used the h4 size. Leading/tracking included local numeric approximations. | Native h2/h3 now follow Heading's actual construction: h2/h3 size tokens, constant bold token, optical sizing, tight tracking, and display/snug leading. Native heading semantics are retained. |
| Nested diagnostic timestamps consumed much of a now-bounded column. | Place diagnostic timestamps above their text, retaining monospace technical alignment and giving words the reading column. The main transcript keeps its timestamp gutter at desktop and stacks at narrow widths. |
| Instructional paragraphs and warnings could still run edge to edge. | Bound record hints to 65ch in their own Atkinson context. The compact performance readout remains a UI data line and wraps naturally. |
| Short fixture sentences hid wrapping problems. | Use a longer local transcript fixture and measure visible reading widths using the rendered font's zero-glyph advance. Preview fails if a targeted column exceeds 65ch plus rounding tolerance. |

## Deliberate adaptations

These are native semantic headings and app-specific transcript rows, rather than a new Article widget. The reading style uses 16px regular Noto Sans and relaxed leading from the reviewed Text/Article recipes. A timestamped conversational log is not converted into an editorial article or justified prose. Noto Serif remains appropriate for a future authored report, rather than being applied to UI help. No claim is made that a reading-width cap alone reproduces all Article semantics or rich-content behavior.

The prominent workflow status is a live readout, not an outline heading: its existing `role="status"` remains. It uses Atkinson at the supported 20px size override, regular weight, tight leading and positive body tracking. Timers and timestamp values retain Roboto Mono because character position matters. Disclosure heading hierarchy remains 16px bold parent / 16px regular subtle child, owned by the actual Candor components.

The 65ch value is a CSS typographic measure based on the active font's zero width, not a guarantee that every line contains exactly 65 letters. It is a maximum, never a minimum; small windows use available width. Font assets are bundled locally and require no cloud/font service.

## Verification

Three render/inspect/refine passes cover bounded disclosures, stacked diagnostic metadata, longer transcript wrapping and bounded instructions. Production build passes; all 106 frontend tests pass. The final 57-state preview reports no page-wide horizontal overflow and no readable text below 14px. Its 182 visible reading-column samples stay at or below 65ch (maximum 64.9995ch). All 47 sampled resolved colour pairings pass klar 3.1.0.

Inspected desktop/short-window, 360/480px, light/dark, long transcript, nested diagnostics, settings, keyboard focus, retry and 200% zoom screenshots. Real Candor disclosure/accordion keyboard and parent-preservation checks continue to pass. The preview explicitly loads the locally bundled reading font before measurement. Existing bundle/style warnings remain: approximately 599 kB initial bundle and 7.86 kB transcription styles, below the unchanged 8 kB stylesheet error limit.

These typography changes are built and uncommitted. Commit `9d4c7f9` remains the pre-typography snapshot. This is a targeted typography/construction review, not a complete accessibility audit or manual screen-reader review.
