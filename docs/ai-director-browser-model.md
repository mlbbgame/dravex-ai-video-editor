# DRAVEX AI Director — browser model v1

## What runs

The video montage path now attempts a lazy, browser-side object-detection pass using Transformers.js and `Xenova/yolos-tiny` (WASM, quantized `q8`). The model code is split into a separate bundle and is only requested when a video montage starts, not on initial page load.

The Director:
1. Uses the existing visual scan to find candidate moments.
2. Selects up to eight candidates spread across the source timeline for model inference.
3. Detects common visible object classes in those frames.
4. Compares detections across sampled frames to estimate object movement and apparent approach/retreat.
5. Combines visual score, motion, contrast, object presence, and scene novelty using different weights for Velocity, Anime, Cinematic, Glitch, and Story.
6. Feeds the new scores into the existing segment planner and renderer.

## Privacy and first-run behavior

- Video stays in the browser in this implementation. Frames are not uploaded to a DRAVEX server or third-party inference endpoint by this module.
- The browser downloads model/runtime assets from Hugging Face on first use. The first run therefore requires network access and can take time; browser caching should help subsequent runs.
- If the model cannot download or execute, frame seeking fails, or Canvas is unavailable, the editor keeps the existing visual-analysis result and continues to produce an export.
- Only a small, bounded sample of frames is sent through object detection to limit memory use on Android devices.

## Known limitations

- YOLOS-Tiny detects object categories; it does not identify arbitrary actions or understand narrative intent.
- The current action cues are transparent visual estimates: sharp/stable motion, object-label changes, object movement in the frame, and apparent approach/retreat. They are not a trained action-recognition output.
- Eight sampled frames are not enough for frame-accurate tracking or reliable detection of brief events. Very fast actions can be missed.
- The style ranking is deterministic scoring, not a generative director or cloud-rendering service.
- This is a first integration step. Test with real Android clips of different codecs, durations, and sizes before merging or deploying.

## Verification

The pure scoring and movement helpers have Playwright unit-style tests in `tests/ai-director.spec.ts`. CI build and browser smoke tests are required before considering this branch ready. A successful build does not replace a real-device model-download and footage test.
