# DRAVEX AI Director — Cloud Architecture Proposal

**Status:** design proposal; not implemented.  
**Scope:** architecture and acceptance criteria for the next DRAVEX AI Director milestone.  
**Safety boundary:** work on a feature branch only. Do not merge to `main`, publish to production, or change the existing live site without explicit approval.

## Product decisions

- Deep video analysis is the target quality mode.
- Support short clips and long source videos.
- Prefer cloud inference and cloud rendering, while keeping the Android browser responsive.
- Produce 3–4 genuinely different edit plans from one source analysis.
- The user selects the preferred plan and remains in control of music, style, effects, and final export.
- Music sources: a licensed DRAVEX library and a user's own audio file.
- Initial director profiles:
  - **Aggressive Car Edit:** recognize acceleration, drift/turns, wheel details, smoke, camera-angle changes, and other motion peaks; match phonk, bass, or aggressive electronic music; use speed ramps, restrained motion blur, and short impact transitions where supported by the source.
  - **Cinematic / Travel:** favor establishing shots, expressive details, location changes, and smooth motion; match the soundtrack to the scene's atmosphere; use restrained camera motion, consistent color treatment, and measured pacing.
  - **Nature & Wildlife:** recognize landscapes, waterfalls, forests, clouds, birds, animal behavior, and macro details; preserve natural color and atmosphere, use smooth pacing, and avoid flashy effects unless explicitly requested.
  - **Food & Cooking:** infer the preparation sequence (ingredients, chopping, mixing, seasoning, frying/baking, plating); preserve chronological continuity and emphasize appetizing textures, steam, close-ups, and the finished dish.
  - **People, Pets & Everyday Life:** prioritize visible faces, expressions, interactions, pet behavior, and meaningful moments; protect face/action framing and avoid abrupt crops, excessive effects, or cuts that remove the key moment.
  - **Products, Tutorials & DIY:** build a comprehensible sequence from overview and materials to detail shots, ordered steps, before/after where available, and the final result.
- These are target behaviors. The current browser prototype uses local heuristics and is not a semantic cloud AI editor.

## Proposed system

1. **Android-first web client**
   - File picker, resumable upload UI, project controls, progress, variant comparison, preview, and download.
   - Keep the UI responsive while uploads, analysis, and renders run asynchronously.
   - Never require a tab to stay open for a cloud job to finish.
2. **Backend API and project service**
   - Authentication/authorization, project ownership, job creation, quotas, signed upload/download URLs, cancellation, and status polling or server-sent updates.
   - Validate file type by inspecting container/signature as well as extension and MIME; do not trust client metadata alone.
3. **Object storage**
   - Separate source media, extracted audio/frames, preview renders, and final renders.
   - Use private objects and short-lived signed URLs. Define retention/expiry and deletion behavior before production.
4. **Job queue and workers**
   - Durable states: `created → uploading → queued → probing → analyzing → planning → previewing → rendering → validating → completed`, with explicit `failed` and `cancelled` states.
   - Jobs are idempotent where practical, report progress, retry transient errors with limits, and can resume from the last completed stage.
   - Resource limits and concurrency controls protect the service from very long or malformed inputs.
5. **Media probe and preparation**
   - Use a server-side media tool such as FFmpeg/ffprobe to inspect duration, codecs, resolution, frame rate, audio tracks, rotation, and variable frame rate.
   - Generate a low-resolution proxy and audio analysis representation where appropriate; keep original media unchanged.
6. **Analysis pipeline**
   - Pass A: coarse sampling across the entire timeline to find scene boundaries and likely events.
   - Pass B: denser temporal sampling around candidate events to analyze motion, action, objects, and visual composition.
   - Audio pass: estimate tempo/onsets, loudness, and broad mood; distinguish estimates from reliable beat tracking.
   - Long-video summarization: preserve timestamps and scene descriptions, then combine chunk-level results into one timeline.
   - Use a provider/model adapter so model vendors can be changed without rewriting project orchestration.
7. **Director planner**
   - Combine detected events, user intent, selected profile, music structure, output duration, and source constraints.
   - Return a validated, editable timeline plan; the model must not render media directly or invent timestamps outside the source.
   - Produce 3–4 meaningfully different plans from the same analysis, with short explanations of their differences.
8. **Music matcher**
   - Match tempo, energy, mood, and beat locations to events and target duration.
   - Support licensed library assets and user-uploaded audio. Record source and license/usage metadata for library tracks.
   - Preserve source audio as a separate mix control. Provide a fallback when beat confidence is low.
9. **Render workers**
   - Render previews before expensive full-resolution outputs.
   - Apply only effects supported by the renderer and source footage. True speed ramping and advanced transitions must not be presented as implemented until the renderer actually supports them.
   - Validate the finished file using media probing and a playback smoke test before marking the job completed.
10. **Observability and cost controls**
    - Track stage durations, failures, retries, queue wait, render settings, and resource consumption without collecting unnecessary media content.
    - Show the user understandable progress and any usage limit before expensive work begins.

## Director plan contract

A planned edit should be represented as structured data, not free-form instructions. At minimum it should include:

- schema/version and source media ID;
- profile and variant ID;
- target duration, aspect ratio, resolution, and frame rate;
- ordered segments with source in/out timestamps and detected event labels;
- transition and effect settings supported by the renderer;
- soundtrack ID or user-audio reference, source in/out, gain, fades, and beat anchors when confidence is sufficient;
- confidence/uncertainty notes for important scene detections;
- validation errors and warnings.

The API must validate all timestamps against the probed source duration, clamp or reject invalid ranges, reject unsupported effects, and avoid trusting model-generated paths or arbitrary URLs.

## Long-video strategy

- Always probe the complete source timeline.
- Analyze the whole video coarsely before choosing highlights, so late events are not silently ignored.
- Increase sampling density around candidate events rather than decoding every frame at full resolution by default.
- Process in bounded chunks with stable timestamps and overlap where necessary to avoid missing actions at chunk boundaries.
- Cache reusable analysis by immutable source identity plus analysis/model version; invalidate it when the source or analysis configuration changes.
- Allow a user to cancel, retry, or return to a completed project without restarting earlier successful stages.
- Define maximum duration, file size, codecs, and quota explicitly; report unsupported files clearly.

## Privacy and reliability requirements

- Use private project/media access controls and short-lived signed URLs.
- Do not expose API keys or provider credentials in frontend code.
- Document what is uploaded, which processing providers receive media, and when originals, proxies, audio, and outputs are deleted.
- Provide a project/file deletion flow and enforce retention cleanup.
- Use resumable/chunked uploads for large files; verify checksums and expected size.
- Never report a successful export before the output exists and passes validation.
- Keep source files unchanged and retain local download as the user's final copy.
- Gracefully handle interrupted networks, expired upload URLs, queue delays, worker restarts, and browser tab closure.

## Acceptance criteria

1. Android Chrome can upload supported short and long videos with visible progress and resumable recovery.
2. The server probes and reports source metadata before analysis begins.
3. A long source is analyzed across its full timeline; late scenes remain eligible for selection.
4. The director returns 3–4 valid, distinct plans with timestamps inside the source bounds.
5. Aggressive Car Edit prioritizes car/action events only when detected with sufficient confidence; otherwise it reports uncertainty and uses a safe fallback.
6. Cinematic / Travel favors expressive shots and smoother pacing without forcing aggressive effects.
7. Both built-in licensed music and user audio can be selected; low beat confidence triggers a graceful fallback.
8. User can preview and choose a plan before full rendering, then edit settings and rerender.
9. Failed jobs expose a useful error and can retry without repeating completed stages unnecessarily.
10. Final exports pass media metadata validation and playback/audio checks before the UI says they are ready.
11. Automated tests cover malformed files, wrong MIME metadata, no-audio videos, very short clips, multi-hour inputs, interrupted uploads, job retries, cancellation, and renderer failures.
12. Existing manual editing and local-only flows continue to work until a deliberate migration is approved.

## Suggested implementation phases

1. **Reliability gate:** finish and verify the current Android source-video import/render QA. Do not build cloud AI on top of an unreliable upload/edit flow.
2. **Contracts and backend skeleton:** define typed project/job/analysis/timeline contracts and a provider-neutral API; keep the cloud adapter disabled until credentials and storage are configured securely.
3. **Upload, storage, and queue:** resumable upload, probing, durable jobs, status reporting, deletion/retention.
4. **First semantic vertical slice:** deep analysis for one supported source class and one profile, with confidence/fallback behavior.
5. **Variant planner:** generate and validate 3–4 timeline plans from one analysis.
6. **Content-profile expansion:** add Nature & Wildlife, Food & Cooking, People/Pets/Everyday Life, and Products/Tutorials/DIY with category-specific event priorities, pacing, framing rules, and restrained effect policies.
6. **Music matching and previews:** library metadata, user audio analysis, beat alignment, low-resolution previews.
7. **Cloud rendering and validation:** bounded render workers and end-to-end output verification.
8. **Expand profiles and harden:** Cinematic / Travel, additional genres, long-video regression suite, cost controls, privacy review, and Android device testing.

## Explicit non-goals for the first milestone

- Training a custom foundation model.
- Claiming perfect scene recognition or beat synchronization.
- Uploading users' media to a cloud provider without clear disclosure and consent.
- Replacing or deleting the current editor before the new pipeline is proven.
- Merging or deploying changes to production without approval.
