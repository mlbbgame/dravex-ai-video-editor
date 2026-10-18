# DRAVEX Global Rebuild — Audit and Acceptance Plan

**Status:** Phase 0 audit baseline  
**Date:** 2026-10-18  
**Working branch:** `rebuild/dravex-global-audit`  
**Base:** `feature/ai-director-cloud-foundation`  
**Production safety:** Never change `main`, merge a PR into `main`, or dispatch/deploy Pages without the owner's explicit approval.

## Executive summary

DRAVEX should be rebuilt around output quality and a single validated edit plan, not around adding more controls. Preserve the current React/Vite Android-friendly web client where it works, but progressively separate media ingest, analysis, planning, timeline editing, rendering, and export validation.

This is an audit baseline, not a claim that all planned capabilities already exist. Semantic AI inference, a cloud upload/job backend, cloud rendering, robust MP4 output, and a full multi-track editor are not established as implemented by the current prototype.

## Verified baseline

### Repository and release safety

- The repository default branch is `main`.
- The Pages deployment workflow on the audited feature branch triggers on pushes to `main` and on manual dispatch. Work on this branch and its PR must not invoke manual deployment.
- The current work is based on `feature/ai-director-cloud-foundation`, never on `main`.
- Existing PR #23 is a draft foundation PR targeting `feature/dravex-camera-audio-v2`; it explicitly says semantic AI and the cloud backend are not connected.
- Existing PR #24 is a separate draft clean-start fix targeting `feature/dravex-camera-audio-v2`. Its scope overlaps the clean-start regression fix already described in PR #23. Do not merge either automatically; reconcile the overlap before any future integration.

### Current implementation observations

- The main branch's package scripts expose Vite development/build/preview only; the AI Director foundation branch adds Playwright QA scripts and test dependencies.
- The current browser renderer supports local WebM paths for ordered image/video sequences in the feature branch; it is not evidence of a robust MP4 pipeline or parity with a professional desktop editor.
- The highlight finder performs browser-side sampling/scoring. It must be described as heuristic visual analysis, not semantic scene understanding.
- Provider-neutral recognition, validated edit-plan, sampling, and asynchronous job contracts exist on the AI Director foundation branch. Contracts and state machines are scaffolding; they do not by themselves call a model, upload media, run server workers, or render in the cloud.
- The UI is concentrated in a large `src/App.tsx`; a staged extraction into focused modules is safer than a wholesale rewrite.
- A project/media clean-start regression test exists on the AI Director foundation branch. It should remain part of the regression suite.

## Keep / improve / replace

### Preserve unless regression tests prove otherwise

- React + Vite client and Android-first responsive layout.
- Existing media import and local preview flows that work on supported browsers.
- Existing local WebM renderer paths and project JSON export, with documented limitations.
- Prompt parsing, style presets, media-kind helpers, and current test fixtures where valid.
- Provider-neutral recognition/job contracts and timeline-plan validation as integration boundaries.

### Improve first

1. Export correctness and truthful capability labels.
2. Media lifecycle: metadata, object URL cleanup, explicit project restore, errors, and long-file behavior.
3. Shared timeline/edit-plan representation consumed by preview and export.
4. Reproducible visual-quality fixtures and regression tests.
5. Modular boundaries around import, analysis, director planning, audio, rendering, and export.

### Do not claim as implemented until end-to-end tests prove it

- Semantic recognition of objects, actions, story, or emotion.
- Connected external AI inference or a cloud processing backend.
- True beat detection / guaranteed cut-to-beat.
- Full speed-ramp support, a complete transition engine, or advanced multi-track audio automation.
- MP4 export on all target browsers/devices.
- Server-side FFmpeg/FFprobe rendering, durable background jobs, or resumable cloud uploads.

## Target architecture

1. **Media intake** — validate file metadata and supported formats; create stable media IDs; track object URL lifecycle.
2. **Media analysis** — coarse sampling across the full duration, then denser sampling around candidates; keep heuristic signals distinct from model outputs.
3. **Director planner** — generate a validated, editable timeline plan from source constraints, style, target duration, and analysis.
4. **Timeline model** — one canonical representation for clips, trim points, order, speed, transitions, audio, overlays, aspect ratio, and output settings.
5. **Preview renderer** — fast and responsive; clearly communicates quality and codec limitations.
6. **Final renderer/export** — use the same timeline semantics; validate the actual output container, duration, dimensions, frame rate, audio, and playback.
7. **Optional server boundary (later, only if required)** — authenticated job API, private storage, queue/workers, FFmpeg/FFprobe, model adapters, quotas, retention/deletion, and cost limits. Never expose provider keys in the browser.

## Phased implementation and exit gates

### Phase 0 — Audit and baseline
- Map source modules, workflows, current tests, known limitations, and overlapping branches/PRs.
- Establish a stable baseline of build and browser QA.
- Exit: findings documented; no production branch or deployment changes.

### Phase 1 — Render correctness and canonical edit plan
- Define and test timeline semantics before broad UI changes.
- Add validation for timestamps, trim bounds, durations, supported effects, aspect ratio, and audio mix.
- Ensure preview and export interpret the same plan.
- Exit: deterministic tests for representative image/video/audio plans; no invalid timestamp or duration can reach rendering.

### Phase 2 — Media lifecycle and Android reliability
- Test file-picker MIME/extension mismatches, unsupported codecs, metadata timeouts, large files, URL cleanup, clean startup, explicit restore, and cancellation.
- Keep UI responsive and show actionable errors.
- Exit: regression tests pass and Android manual smoke checklist is ready.

### Phase 3 — Analysis quality
- Improve full-duration coarse sampling, candidate ranking, dense re-sampling, and explainable selection.
- Build fixtures for static shots, fast action, scene changes, low light, variable durations, and silent/source-audio clips.
- Exit: selection is reproducible, covers the source timeline, and is evaluated against a small manually reviewed set. Label results heuristic until a real model adapter is connected.

### Phase 4 — Director planning
- Generate multiple meaningfully different, valid edit plans from the same analysis.
- Enforce source bounds, target duration, no accidental duplicate moments, sensible shot lengths, and style-specific pacing.
- Exit: plans are structurally valid and human-reviewed for pacing/story; user can edit or reject them.

### Phase 5 — Effects, transitions, and audio
- Add renderer-backed features incrementally: safe speed changes first, then supported transitions, motion/grade controls, beat estimation, volume, fades, and source-audio handling.
- Every UI control must correspond to a real rendering behavior or be clearly marked unavailable.
- Exit: each feature has a fixture and exported-file check; effects do not introduce broken frames or audio clipping.

### Phase 6 — Export hardening
- Verify output metadata and playback; test long duration, different aspect ratios, orientation, audio, and failure recovery.
- Decide browser-only vs server rendering based on measured limits, not assumption.
- Exit: a release checklist confirms expected duration, dimensions, audio, successful playback, and preview/export parity.

### Phase 7 — UI integration and accessibility
- Refactor the large app into focused modules only after stable domain boundaries exist.
- Keep mobile controls touch-friendly, keyboard accessible, and free of horizontal overflow.
- Exit: Playwright mobile smoke suite and real Android checks pass.

### Phase 8 — Optional cloud AI/rendering
- Implement only after a cost/security feasibility decision: auth, private storage, resumable uploads, durable job queue, worker isolation, model adapter, deletion/retention, quotas, observability, and cost guardrails.
- Exit: real end-to-end integration tests with secrets held server-side; no claims based on mock contracts alone.
- Requires a separate approval before introducing paid services or publishing.

## Quality gates for every change

- Build/type-check passes.
- Relevant unit and Playwright tests pass.
- Regression suite includes clean startup, mobile overflow, style selection, media-kind checks, timeline validation, long clips, and export metadata/playback.
- Compare before/after output using the same source files and settings.
- Report separately: automated checks passed, manual Android checks performed/not performed, and known limitations.
- No production deployment, merge to `main`, or paid integration without explicit approval.

## Initial risk register

| Risk | Mitigation |
|---|---|
| Regression from a broad rewrite | Small feature branches and focused PRs; preserve baseline fixtures |
| UI claims exceed renderer behavior | Capability matrix and export-level tests |
| Heuristic scores are mistaken for AI understanding | Label method and confidence honestly; compare with manually reviewed examples |
| Mobile memory pressure or stale media | Lifecycle tests, clean startup, explicit restore, long-file limits |
| Preview/export mismatch | Canonical edit plan and parity fixtures |
| Duplicate branch work | Reconcile overlapping PR #23 / PR #24 before integration |
| Unexpected cloud cost or media exposure | Free-first; no browser secrets; private storage/retention design before backend work |
| Accidental production publish | No manual Pages dispatch; no `main` writes or merges without explicit approval |

## Next implementation step

After this audit, Phase 1 should begin with a small, testable edit-plan validation layer and renderer parity fixtures. Avoid a visual redesign or a full app rewrite until timeline and export behavior have measurable acceptance criteria.
