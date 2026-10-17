# DRAVEX semantic media recognition — implementation notes

**Status:** contracts, validation, and timestamp sampling are implemented on `feature/ai-director-cloud-foundation`. No real model inference or cloud upload is connected yet.

## Decisions for the first working version

- **Quality first:** analyze the entire source in a coarse pass, then sample more densely around candidate moments; validate every timestamp against server-probed duration.
- **Video and photos:** one shared recognition contract; still images use a normalized one-second interval and static motion.
- **Free-first:** keep the provider adapter replaceable. Begin with local/free media probing and open-source CV/audio tools where practical; only add paid multimodal inference if free analysis fails quality acceptance tests. Cost/latency must be measured, not assumed.
- **Android-first:** the browser uploads original media directly to private object storage through a short-lived signed URL. The browser must not proxy multi-hundred-megabyte files through a model endpoint or hold provider credentials.
- **No fabricated AI:** the UI must say “analysis unavailable” rather than show example detections when a provider is disconnected or fails validation.

## Provider boundary

`src/video/recognition-provider-contract.ts` defines the server-side provider interface and pipeline gate:

1. The trusted backend probes the original file and supplies media ID, kind, duration, dimensions, MIME type, size, and audio-track presence.
2. The sampler creates timestamped frame assets across the complete timeline and optional dense frames around candidate moments.
3. An injected provider returns untrusted data.
4. The pipeline validates the response against the requested source identity/type/duration and rejects malformed data before the director can consume it.

The interface does not call a provider and must not be imported into browser code to call a model. Signed asset references must be short-lived, private, and created server-side. API keys belong only in server secrets.

## Target architecture

```text
Android browser (React/Vite)
  -> authenticated project/job API
  -> private object storage (resumable upload + signed URLs)
  -> job queue / worker
      -> ffprobe: authoritative duration, dimensions, streams, codec
      -> FFmpeg: thumbnails, frame proxies, audio proxy
      -> coarse sampler + dense sampler
      -> replaceable recognition provider
      -> semantic validator
      -> AI Director planner (3–4 editable plans)
      -> FFmpeg preview/final renderer
  <- progress, detected moments, preview links, errors
```

Use a small backend service and private object storage before adding full rendering workers. A static GitHub Pages frontend alone cannot securely hold provider secrets, run reliable long jobs, or accept very large uploads safely.

## Next implementation phase

1. Add authenticated upload/job endpoints and private resumable storage; enforce ownership, quotas, size limits, cancel/retry, retention, and deletion.
2. Add a server-side FFprobe adapter and normalize image metadata without trusting file extensions or browser MIME labels.
3. Implement coarse frame extraction and optional audio proxy generation with FFmpeg; keep a full-timeline coverage test for 9-second, 60-second, multi-minute, and long clips.
4. Start with a free/local vision + audio baseline and benchmark it against a small manually reviewed set of videos/photos. If semantic quality is inadequate, add a paid multimodal provider behind the same interface.
5. Render the recognition report in the UI, then feed only validated results into the Director.
6. End-to-end test Android upload, job progress, retry/cancel/delete, photo recognition, videos with/without audio, malformed files, and large uploads before enabling the feature.

## Current verification

The provider boundary is tested with a fake adapter only. Passing these tests proves input/output validation, **not** that AI recognition works. Build and mobile browser QA passed for commit `1e44dd29a6b7a25bc210418d9ab89ca5e9d6803d`; the new provider-contract changes must pass CI before this milestone is considered verified.
