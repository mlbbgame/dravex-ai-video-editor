# DRAVEX Smart Eye: evidence memory and long-timeline perception

## Goal
Smart Eye is a separate perception/evidence layer for AI Director. It keeps a structured, timestamped ledger of every event currently emitted by the analysis and a normalized set of detected object labels. The director can use this report for shot ranking, variant differentiation, diagnostics, and later integrations.

## Current implementation
- Builds a timestamped memory ledger from the event timeline and sampled-frame observations (detected labels and visual cues).
- Keeps labels attached to sampled timestamps when available; aggregated labels without a frame timestamp remain explicitly untimed rather than being assigned to second zero.
- Deduplicates entity labels, sorts event evidence by source time, rejects events outside the source duration, and bounds confidence/coverage values.
- Reports sampling coverage and explicit limitations rather than claiming complete video understanding.
- The report is returned by the AI Director for the current analysis.

## What “no memory limit” means safely
The memory ledger does not discard events supplied by the current analysis merely to keep only a small recent window. But source perception is still based on sampled frames and the existing mobile inference budget. Truly processing every frame forever would be unbounded in CPU, memory, battery, and latency; this implementation intentionally does not do that. Cross-session learning is not enabled and should require explicit consent, privacy controls, and a defined storage policy.

## Current limitations / next layers
The detector remains YOLOS Tiny plus motion/contrast heuristics. It does not yet understand game-specific events (kills, goals, skill combos), cooking steps, drift phases, emotion, or scene semantics reliably. Those require a temporal/video-language model or domain-specific detectors, plus a labeled evaluation set. Smart Eye should preserve observed vs inferred evidence and avoid presenting heuristic confidence as a calibrated probability.

## Validation
Pure-function regression tests cover timeline retention, invalid timestamps, bounds, entity deduplication, and conservative category inference. Passing these tests does not establish real-footage semantic accuracy or Android 4K performance.
