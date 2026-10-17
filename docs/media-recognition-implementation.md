# DRAVEX semantic media recognition — implementation notes

**Status:** contract and sampling utilities are implemented on `feature/ai-director-cloud-foundation`. Semantic inference is not yet connected to a cloud model.

## What a recognition provider must return

- Whole-source summary and labels for subjects, scenes, actions, composition, quality, and mood.
- Confidence values from 0 to 1 for every label and moment.
- Timestamped moments with source start/end, visible content summary, motion level, and editing value.
- Audio presence and cautious estimates for speech, music, and beat confidence.
- Warnings for ambiguity, poor source quality, unsupported content, or incomplete analysis.

The contract lives in `src/video/media-recognition-contract.ts`. It rejects mismatched source identity, media type, invalid confidence, malformed output, and timestamps outside the source bounds. For a still image, use a normalized one-second analysis interval and static motion.

## Video sampling

`src/video/recognition-sampling.ts` defines a two-pass sampling strategy:

1. Coarse samples spread across the complete timeline, including the first and last timestamps.
2. Denser samples around candidate moments, with strict source bounds and a sample cap.

This is designed to avoid analyzing only the first few seconds of long videos. The utilities plan timestamps only; frame decoding, cloud upload, and model inference still need to be connected.

## Next engineering steps

1. Add a secure backend with authentication, private storage, resumable uploads, job status, cancellation, and deletion.
2. Probe the real media server-side and extract frame/audio proxies.
3. Connect a vision/video model through a provider adapter; keep credentials off the frontend.
4. Display detected subjects, scenes, events, confidence, and uncertainty in DRAVEX.
5. Feed validated recognition into the director planner to produce 3–4 distinct edit options.
6. Test Android uploads and short/long videos end-to-end before enabling cloud processing.

Do not show fabricated recognition results. Until the provider is connected, label these modules as infrastructure, not working AI recognition.
