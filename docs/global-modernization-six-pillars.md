# DRAVEX global modernization: six pillars

This change set is intentionally developed on a feature branch. Do not merge to `main` until the required checks pass.

## 1. Highlight selection
- Keep samples distributed across the complete source duration.
- Reject invalid timestamps and trims outside the source.
- Avoid repeated/overlapping source intervals.
- Verify style rankings produce different choices, not just different filters.

## 2. AI Director and content understanding
- Keep semantic inference explicitly confidence-gated.
- Treat unknown or ambiguous content conservatively.
- Cover automotive, nature, food, people, wildlife and product/tutorial content.
- Keep model failure optional so a usable visual edit can still be produced.

## 3. Montage variants
- Variants must differ in selected moments and pacing.
- Keep chronology coherent unless a style explicitly permits rearrangement.
- Validate that short sources do not produce zero-length or out-of-range cuts.

## 4. Music and motion
- Detect beat markers with a safe fallback when beat confidence is weak.
- Keep cut boundaries ordered and separated.
- Preserve smooth speed ramps and restrained effects for non-action footage.

## 5. Android performance and usability
- Avoid continuous thumbnail animations on touch devices.
- Keep touch targets comfortable and the main preview unobstructed.
- Keep long-video analysis bounded and yield to the browser during scans.

## 6. Export integrity
- Validate duration and dimensions after rendering.
- Detect suspicious black/frozen samples and present findings as warnings, not unquestionable proof.
- Keep export checks in browser QA and upload rendered samples for review.

## Verification gates
1. TypeScript production build.
2. Playwright browser tests.
3. Regression tests for selection, semantic profiles, beat sync, mobile flows, and export metadata.
4. Lighthouse mobile audit with HTML/JSON artifacts.
5. Manual Android review for actual device playback and export; CI emulation is not a physical-device test.
