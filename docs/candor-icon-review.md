# Icon review

Initially reviewed 25 October 2026 after checkpoint `c459137`. Sources: current Candor Icons, Button, Toolbar, Disclosure, Alert, Badge and AccessibleText stories/constructions at `a4d27af8edc503aa801b7b336e1e23b41287c9e5`, plus the app templates/styles and screenshots of the real built app from `disabled-final`. Initial audit inspected light/dark recording, ready, copied, Models and History. The findings below describe that starting point; subsequent implementation and verification follow at the end.

## The role determines the icon

Candor's [Icons documentation](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/docs/design-tokens-icons--docs) and [source](https://github.com/pawn002/candor/blob/a4d27af8edc503aa801b7b336e1e23b41287c9e5/src/web-components/design-tokens/icons.stories.ts) establish:

- Fill (`ph-fill`) identifies actions with a useful filled form. This includes labelled action buttons: the story's Search and Download examples use fill even with text beside them.
- Bold (`ph-bold`) identifies status, direction, carets and selection, plus stroke-only actions. Inspect the fill version: a glyph cut out of a box/bar is a reason to use bold instead. Toolbar examples explicitly use bold for stroke-led actions.
- Regular (`ph`) accompanies metadata and other supporting text. Merely having text beside an actionable icon does not automatically make regular correct.
- Labelled-button icons match the label's size and colour. Icon-only filled buttons use 28px; stroke-only ones use 20px. Their resting subtle colour belongs on the button, and hover changes to default text colour. Keep the app's 44px targets: the smaller target in some Candor examples does not override this app's requirement.
- Decorative icons are AT-hidden; visible labels or the button's accessible name carry meaning. Status shapes and words must survive loss of colour. Raw status characters are discouraged in [AccessibleText guidance](https://github.com/pawn002/candor/blob/a4d27af8edc503aa801b7b336e1e23b41287c9e5/src/web-components/components/typography/accessible-text/candor-accessible-text.ts).
- One weight class per glyph. Phosphor classes work in light DOM and light-DOM slots, not inside a component's shadow root. Use official SVG paths/currentColor there. Explicit sizing retains line-height 1. The installed Phosphor base classes already provide line-height 1.

The earlier widget review's claim that glyphs beside button text should be regular was too broad. This review supersedes it.

## Current findings

| Finding | Classification | Proposed correction |
| --- | --- | --- |
| Record answer uses regular microphone, Copy transcript regular copy, model Download regular cloud-arrow-down. | Weight does not follow the documented action examples. | Use filled versions, matching the existing button label size/colour. Do not let the generic fill-size multiplier enlarge them. |
| Settings trigger uses an official regular gear SVG mask. | Source is correct; weight is inconsistent with Candor's settings-action convention. | Use the filled gear from official Phosphor SVG source. Preserve the supported label part, decorative mask, text name and focus behavior. |
| Recording dot and Copied checkmark are literal `●` and `✓` in CSS-generated heading content. | Outside Candor's status-icon construction; not explicitly AT-hidden and not covered by current icon sampling. | Use explicit AT-hidden Phosphor bold record/check-circle shapes alongside the existing status words. Do not assume CSS-generated text is silent to AT. |
| History empty state uses a filled 42px clock-counter-clockwise. | Informational illustration uses a weight reserved for action. | Use bold at an intentional illustration size. It should not resemble another clickable History command. |
| History uses check-circle for completed, info for every other outcome. | Semantic mismatch with Candor's outcome-specific shapes. Not a colour-only failure: status words remain. | Distinguish failed (x-circle), processing/pending (clock/hourglass), cancelled (prohibit), completed (check-circle), all bold. |
| Recording header icon/border and generated recording marker use the error **text** token; the badge also keeps a shield while saying Transcribing. | Status-token role inconsistency; transcribing glyph is a separate semantic refinement. | Pair non-text indicators with the relevant non-text status token and measure actual contrast. Use a processing glyph for Transcribing, retaining the explicit words. |
| `.button--icon i` gives every icon 28px; generic `i.ph-fill` uses 1.2em. | Sizing rules cannot distinguish stroke-only controls and labelled actions. | Define role-specific recipes: labelled icon inherits text size; icon-only fill 28px; icon-only bold 20px; separate status/illustration sizes. |

Refresh is a refinement candidate, not a claimed definite weight failure. Its actual Phosphor fill SVG is a ring/arrow, not a boxed cut-out. Candor's toolbar groups arrows and undo with stroke-led controls; compare bold 20px against the current fill 28px in the rendered header before choosing. Avoid classifying it from the word "arrow" alone.

Existing good choices: bold directional connectors and select carets; bold alert and installed-state icons; named History icon buttons with supplementary actual Candor tooltips; light-DOM font icons with one weight class; actual Candor disclosure chevrons; regular file metadata icon. The custom app logo is branding, not a substitute UI glyph, and does not need to become Phosphor. CSS loading spinners and the checkbox's constructed check are not automatically icon-family violations.

## Opportunities, in priority order

1. **Complete the action vocabulary.** Give Stop & transcribe a stop glyph, Choose audio file an open-folder glyph, Transcribe file a waveform glyph, Save transcript a floppy-disk or file-export glyph, Retry a clockwise arrow, and Download a model a download glyph. Fill for object-shaped actions, bold for stroke-only ones. Preserve visible text and the three stable action positions. This makes the three steps feel intentional rather than leaving only Record and Copy illustrated.
2. **Give the three main views a small visual signature.** Candidate pairings: Transcription/microphone, Models/cpu, History/clock-counter-clockwise. They remain labelled navigation controls; follow action weight rules after checking actual fill geometry. Prototype the complete row at 360px before committing to it, because text plus three icons can consume the current spare width. Avoid changing labels to icon-only controls.
3. **Improve outcomes and empty states.** Resolve the state-shape findings above, with a bold History illustration and a clear copied-success symbol. This adds warmth and recognition while communicating something useful.
4. **Make the transcript summary easier to scan.** Small regular timer/clock and gauge icons could group audio duration and processing speed. Keep the transcript/model name and numeric values readable; avoid repeating an icon on every timestamp or segment.
5. **Identify file input more accurately.** Replace the regular music note beside the selected interview recording with regular file-audio. The current icon is valid metadata styling, but its music association is less suitable for spoken answers.
6. **Optional appearance/source cues.** Regular sun/moon/desktop symbols can support the three labelled theme choices; microphone/file-audio can support source identification. Try these only after the higher-priority changes: their proximity to navigation and action icons could repeat the same shapes and make the compact header busier.

Do not add icons to every model row, badge, table heading, help paragraph or transcript line. Keep state indicators bold, supporting metadata quiet, and action icons consistent. Avoid introducing extra colours, cards or animation purely for interest. Timing-help disclosure already has a clear chevron; an additional help glyph is optional and lower value than missing action icons.

## Suggested next implementation

First correct weights, replace generated status symbols, differentiate outcomes and establish the sizing recipes. Then prototype the missing action icons and the three navigation icons. Review hierarchy, label wrapping, stable positions, focus, light/dark contrast and 360/480px layouts before considering theme/metadata additions. Required readable explanations stay in the layout; icons and tooltips do not replace them.

The initial review made no UI implementation or new contrast/conformance claim. The implementation below received fresh render–inspect–refine passes and actual non-text pairing checks.

## Implemented icon pass

- Labelled Record/Copy/Download actions now use fill. Added filled Stop, open-folder, Save and setup-download icons, with bold waveform for Transcribe and bold clockwise arrow for Retry. File metadata uses regular file-audio. The gear mask now uses the official [filled Phosphor SVG](https://github.com/phosphor-icons/core/blob/main/assets/fill/gear-fill.svg); the retained MIT license still covers the asset.
- Added labelled microphone/CPU/history navigation icons. Main-tab spacing reduces using existing spacing tokens below 640px, keeping all three labels and 44px targets at 360px.
- Removed the raw generated recording/copy symbols. Explicit AT-hidden bold state icons now accompany the live status text, with an 8px gap. History uses distinct check-circle, waveform, x-circle, hourglass and prohibit glyphs; its empty state uses bold rather than fill. The header uses a waveform while transcribing.
- Removed the generic fill enlargement. Labelled-action icons inherit label size/colour; icon-only Copy uses fill at 28px, Refresh uses bold at 20px. All retain 44px targets. Regular supporting icons and informative bold symbols keep their separate roles.
- The recording badge uses the semantic status icon/background pairing. Sampling caught status red on the elevated dark header at OKCA 2.8; pairing with status-error-bg resolves it. Its standard border is decorative, not a state channel. The icon and the word Recording carry the state.
- Deliberate app adaptations: main tabs remain native Angular-controlled tabs with decorative icons; the settings gear remains a decorative mask on the supported Candor label part; workflow buttons use 4px horizontal padding and gap to fit icon plus label at 360px without reducing font or target size. Theme/source controls and transcript metadata received no additional decoration in this pass.

Three meaningful rendered passes corrected status-icon spacing and narrow Stop wrapping, then corrected the measured recording-badge colour pairing. Inspected ready, recording, processing, completed/copied, retry and file workflow; Models; History empty/loading and outcome states; desktop/short windows, 360/480px, light/dark, keyboard focus and 200% zoom. Final fixtures: `icons-pass3`, 74 captured states, no page-wide horizontal overflow or readable text below 14px. Record/Stop/Copy desktop bounds match across ready, recording, processing, completed and copied. Workflow targets remain 44px high, including narrow Stop.

The fixture audit checks actual glyph presence/Phosphor font, exactly one weight class, decorative AT hiding, labelled/icon-only size recipes, official gear mask pairing and actual icon/background contrast. All 75 sampled pairings pass Klar 3.1.0. All 114 frontend tests pass; the native offline recording/transcription/copy/file smoke passes with a synthetic microphone and isolated profile. Build passes unchanged hard limits (transcription styles 7.87 kB), with existing bundle/style warning categories. No manual screen-reader or complete accessibility conformance audit is claimed. Built and uncommitted; the user's running app was not restarted.
