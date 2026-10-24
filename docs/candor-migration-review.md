# Candor 3.0.0 to 6.0.0 review

Reviewed and migrated on 24 October 2026 for issue [#21](https://github.com/pawn002/whisper-electron-app/issues/21). The frontend now pins tokens to 6.0.0 and uses the supported CSS export.

Sources: the complete release sequence in the [6.0.0 changelog](https://github.com/pawn002/candor/blob/v6.0.0/CHANGELOG.md) and the [breaking-change guide](https://github.com/pawn002/candor/blob/v6.0.0/docs/BREAKING-CHANGES.md). Reviewed minor and patch entries as well as major releases. Unreleased changes are outside the 6.0.0 target.

Also read the published Storybook's [Introduction](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/docs/introduction--docs), [Contrast Guidance](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/story/design-tokens-typography--okca-contrast-guidance) and [Token Reference](https://main--69c25e2492ad056c24329876.chromatic.com/?path=/story/design-tokens-colors--token-reference). The catalog identifies itself as version 6.0 and tracks main; the installed 6.0.0 artifact is the authority for token availability. In particular, 14px is a conditional floor, status icon and text colours have different roles, and pairings must be checked against the actual surface.

## Implemented and verified

- All readable sizes are at least 14px, using the supported scale. Instructions, errors and transcript prose use 16px. Functional 14px actions use weight 700; timestamps and metadata use neutral text with measured contrast. Atkinson 400/700 is loaded locally and declared directly, so accessible-font roles no longer silently fall back.
- Replaced ad hoc muted text mixtures with semantic text. Outcome labels use neutral text and a separate decorative status icon. Neutral alert/toast surfaces, real ghost hover fills, native themed select arrows and visible error-state focus follow the catalog's guidance. Main actions and secondary workflow actions retain 44px targets.
- Reviewed four visual passes. Fixed timestamp overlap, narrow status/duration crowding, shrinking numbered step markers and recording-indicator contrast. The main three controls have identical desktop coordinates in ready, recording, processing, completed and copied states.
- Final preview captured 32 states across desktop, short windows, 360/480px widths, light/dark themes and 200% zoom, including Models, History, retry and both-theme error focus. No page-wide horizontal overflow was measured. Readable text below 14px now fails the preview.
- Klar 3.1.0 measured 36 distinct rendered pairings with zero below their selected Candor floor, including non-text indicators, focus and control boundaries. The audit conservatively applies the functional 14px floor to sampled metadata too. Values come from resolved CSS colours, not 8-bit screenshot samples. This is coverage of the captured states, not an exhaustive accessibility conformance audit.
- `npm test`: 98 frontend tests and 18 Electron tests passed. Production build passed. Real native Whisper/VAD recording, Copy, repeat/discard and file-transcription smoke test passed with HTTP(S) blocked and a synthetic microphone fixture.
- Every token referenced by app SCSS exists in the installed 6.0.0 CSS. Lockfile review found expected font upgrades and dependency classification changes after the old token package's development dependencies were removed; Jest's peer resolution also updates parse5/entities and adds its DOM dependencies. Angular versions did not change.

Build warnings remain: the initial bundle is approximately 547 kB raw / 100 kB estimated transfer, over its 500 kB warning threshold. The transcription component stylesheet is approximately 7.1 kB, over the 6 kB warning threshold but under its unchanged 8 kB error limit. The Phosphor imports now name their CSS files, eliminating the prior Sass import warnings. Screen-reader announcement quality has not been manually tested.

To reproduce, run `npm run preview:workflow`, inspect its screenshots, then run `node tests/electron/candor-contrast.cjs <metrics.json> <absolute-path-to-klar.js>`. The preview writes into the OS temporary directory under `whisper-visual-review/current`; the contrast audit writes `candor-contrast.json` beside its metrics. Named passes use `WHISPER_VISUAL_PASS`.

## Release-by-release impact

| Release | Changes relevant to this integration | Action |
| --- | --- | --- |
| 4.0.0 | Purple primitives renamed to indigo; article/blog/syntax styles removed from the tokens package; light status icon colours darkened. Web components became a separate published package. | No purple primitive or removed stylesheet usage found. Recheck status colours in our own controls. Keep the tokens-only integration. |
| 4.1.0 | Adds the themed slider-thumb token. Removes Angular from Candor's own development toolchain; fixes component overflow and dark slider rendering. | No slider token migration required. Upstream tooling removal does not require changing this app's Angular version. Component fixes do not apply automatically to our markup. |
| 4.2.0 | Introduces supported CSS exports, optional font-loading stylesheet, subtle background and callout tokens, inline-code component, styling hooks and consistent value events with deprecated aliases. | Switch the deep CSS import to `@candor-design/tokens/candor-tokens.css`. Preserve deliberate local font imports. No Candor component event bindings to migrate. |
| 5.0.0 | Reauthors colours into sRGB; removes `--color-border-control-on-surface` and consolidates control borders. Revises readable-text guidance: no sub-14px reading text; essential regular instructions at least 16px. Removes deprecated component events, splits status/state roles and drops the text component's xs size. Introduces stronger contrast/gamut audits using klar 3.x. | No removed border token found. Recheck actual colour pairings and typography in our custom UI, including timestamp/step metadata and recovery instructions. Component API changes do not require replacements in a tokens-only app. |
| 5.0.1 | Cleans runtime dependencies from the tokens package, including TypeScript/Lit/tslib; declares culori on the component package where it is actually used. | Review the lockfile diff for dependency removals. Retain this app's explicitly required compiler/framework dependencies. No need to add Lit or culori for CSS tokens. |
| 6.0.0 | Re-steps grey ramps and removes gray-50/highlight/blockquote tokens. Changes light page to cool off-white, warnings to gold, destructive actions to error red, dark primary to pale navy, control borders and light focus rings. Adds muted/hover and forward/recede surfaces, scrollbar geometry and heading-leading tokens. Updates component icons, alerts, toasts, focus, scrolling and accessibility behaviour. Fontsource runtime dependency floors increase. | No flagged removed token or direct grey primitive references found. Review light/dark rendering, fonts, custom mixed colours, focus, status, hover and borders. Do not assume new component behaviour is provided by upgrading CSS tokens. |

## Pre-migration findings

- `frontend/src/styles.scss` still uses the unsupported deep import and contains locally implemented button, input, badge, alert and toast styles. Upstream component changes do not update these rules.
- Ghost hover currently uses the surface fill. Candor 6 specifically fixes invisible hover on cards using `--color-bg-hover`; assess our analogous rule and pair its foreground with the new fill.
- Some error/status text uses `--color-status-error` or `--color-status-success`, the icon/non-text roles. Check whether those sites need the corresponding `-text` token and measure the actual background.
- Workflow step labels, result metadata and timestamps include 12px text. The earlier visual review's sampled WCAG ratios do not establish compliance with Candor's revised text-size policy. Review their role and readability during migration rather than treating the existing size as validated.
- Our input error focus style still uses a translucent status-colour shadow. Candor 6 adds an explicit focus outline even in error states; inspect the custom input rule for the same visibility problem.
- Our alert/toast styles retain tinted fills and side bars. Decide deliberately whether to adopt the new neutral surface treatment; it will not happen through token updates alone.

## Migration checklist used

1. Upgrade the tokens dependency to the issue's 6.0.0 target, update the frontend lockfile and use the supported CSS export.
2. Compare consumed token names against the installed 6.0.0 artifact, including inherited dark values. Check lockfile and font changes.
3. Resolve the custom style concerns above without restoring obsolete token values to hide intentional palette changes.
4. Measure app-authored colour pairings with klar, including mixed/transparent colours against their effective backgrounds. Keep WCAG measurements distinct from OKCA scores and Candor's own tier policy.
5. Follow AGENTS.md for rendered light/dark, narrow, zoom, keyboard focus and workflow review. Run the existing build, tests and offline interview smoke test. Record intentional visual differences and remaining gaps.
