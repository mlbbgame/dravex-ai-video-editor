# DRAVEX AI Director — global architecture and quality gates

## Purpose

Build one reusable director pipeline for arbitrary user footage, not a collection of unrelated style-specific heuristics. The director must distinguish observable evidence from guesses, plan the edit before rendering, produce meaningfully different variants, and measure output quality independently from model confidence.

This document is the implementation contract for the next stages. It does not claim the current lightweight classifier already provides full action understanding.

## Pipeline contract

1. **Ingest and normalize**
   - Read duration, dimensions, orientation, frame rate when available, audio presence, and codec metadata.
   - Keep source timestamps as the single time base; normalize all proposed trims to the source range.
   - Detect unsupported media early and preserve a deterministic fallback.
2. **Adaptive temporal sampling**
   - Sample more densely around detected scene changes or motion peaks, and more sparsely in stable intervals.
   - Keep a strict device-aware time/frame budget; every optional stage must respect the remaining budget.
   - Record which timestamps were actually analyzed. Never describe unobserved intervals as understood.
3. **Visual and semantic evidence**
   - Combine frame-level labels/detections with motion, scene-change, sharpness, exposure, and framing cues.
   - Preserve confidence and provenance for each observation.
   - Use temporal action models or cloud inference only behind an explicit capability interface; the current image classifier and motion deltas are not proof of specific actions.
   - Abstain when evidence is weak or conflicting rather than inventing a goal, kill, drift, cooking step, or emotion.
4. **Event timeline**
   - Convert observations into timestamped event candidates with start/peak/end, confidence, category, and evidence.
   - Merge nearby duplicate candidates; suppress overlapping trims; preserve important context before and after a peak.
   - Separate an event's semantic relevance from its visual quality and its suitability for a chosen edit style.
5. **Director scoring**
   - Score candidates using documented, bounded components: relevance, temporal peak, visual quality, novelty, continuity, and framing.
   - Normalize per source to avoid a high-motion clip making all other clips look unimportant.
   - Keep style weights explicit and unit-tested. Do not allow an unknown profile to silently become a confident semantic claim.
6. **Edit-plan generation**
   - Generate an immutable edit plan before rendering: ordered source intervals, output duration, aspect ratio, transition type/duration, speed curve, crop/focus, color treatment, audio segments, and fallback decisions.
   - Validate every interval and transition against source bounds and neighboring cuts.
   - Enforce non-overlap after final shot-length normalization, not only on raw candidate windows.
7. **Variant diversity**
   - Aggressive, cinematic, music-driven, and story/creator variants must differ in selected moments, order, pacing, or narrative structure—not only filters.
   - Compare variant fingerprints (source intervals, order, shot lengths, effect profile) and reject near-duplicates where alternatives exist.
   - If the source lacks enough distinct moments, explain the limitation rather than fabricating diversity.
8. **Render and export**
   - Separate preview and final-export profiles.
   - Validate expected dimensions, duration, video/audio tracks, and successful playback after export.
   - Treat 4K as a measured device/pipeline capability, not just a requested width/height and bitrate.
9. **Quality feedback**
   - Store per-run diagnostics locally for the test report: sampled timestamps, selected intervals, score components, variant fingerprints, warnings, render duration, output profile, and validation results.
   - Never require uploading private source footage to collect diagnostics.
   - Use user choices and explicit ratings as feedback only after opt-in; do not claim online learning unless a real training/update path exists.

## Evidence and confidence rules

- **Observed:** directly measured in frames, metadata, or detector output.
- **Inferred:** plausible interpretation based on multiple observations, with confidence.
- **Unknown:** insufficient, conflicting, or out-of-budget evidence.
- Tests built from generated images, color bars, or fabricated motion may validate plumbing and invariants, but cannot validate semantic accuracy.
- Real-footage benchmark results must identify clip category, expected moments, actual selected timestamps, variant, device/browser, and reviewer score.
- Never publish an accuracy percentage without a labeled test set and recorded results.

## Required regression invariants

- All timestamps and trims are finite, ordered, positive-length, and within source duration.
- Final rendered intervals do not overlap unless an explicit transition implementation intentionally overlaps them.
- No unintended repeated source intervals inside a variant.
- Variants are distinct in edit decisions when the source supports it.
- Short, medium, and long clips all receive a bounded analysis budget and usable fallback.
- A failed optional semantic stage does not prevent basic editing/export.
- Output duration and aspect ratio match the edit plan within documented tolerances.
- Export validation detects missing video/audio tracks, empty output, unplayable media, and incorrect dimensions.
- 4K diagnostics separately identify source-preview lag, generated-preview lag, export-time cost, and exported-file playback issues.

## Implementation sequence

### Gate A — correctness and baseline
- Fix current CI failures first.
- Audit sampling, candidate coverage, interval selection, variant construction, renderer trim normalization, and export validation.
- Add tests for final rendered intervals, not just raw candidate windows.
- Preserve a known-good fallback path.

### Gate B — event timeline
- Introduce a typed event representation and explicit evidence/confidence.
- Add duplicate suppression, context windows, scene boundaries, and event-level test fixtures.
- Keep heuristic evidence separate from verified action labels.

### Gate C — director planning
- Make edit plans explicit and validate them before rendering.
- Generate four variants from the same event timeline using distinct objective weights and pacing constraints.
- Add variant-fingerprint diversity tests.

### Gate D — stronger perception
- Benchmark available temporal/action-recognition models against the labeled clip set.
- Evaluate browser/device inference versus optional cloud inference for latency, privacy, cost, and accuracy.
- Integrate a stronger model only if it improves measured results and has a safe fallback.

### Gate E — quality and performance
- Run real-footage review across gaming (including PUBG Mobile and MLBB), cars, nature/travel, cooking, people/vlogs, animals, sports, anime, and mixed scenes.
- Compare 720p, 1080p, and 4K on the same source and edit plan.
- Keep all work on test branches until CI and real-device acceptance criteria are met.

## Definition of done

A stage is done only when:
1. its code and tests exist;
2. CI passes on the exact head commit;
3. limitations and benchmark evidence are recorded;
4. previous passing regression checks remain green;
5. no unapproved change has been merged to main.

A passing unit test is not a substitute for real-footage review. A successful export is not proof of good editing. A 4K profile is not proof of smooth 4K playback.
