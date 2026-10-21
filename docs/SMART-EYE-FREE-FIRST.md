# Smart Eye — Free-first runtime contract

## Goal

Smart Eye must remain useful without paid AI APIs, API keys, account tokens, or a required cloud inference service. The default path runs the existing quantized image classifier in the browser through `@huggingface/transformers` and ONNX Runtime, using WebGPU when available and CPU/WASM as a fallback.

## Runtime rules

- Never upload source videos, extracted frames, filenames, or user media to an inference provider by default.
- Public model weights may be downloaded on first use. This still requires an internet connection unless the browser already has a usable cached copy.
- Do not add paid API SDKs, secrets, or provider calls to the browser bundle as a shortcut for better perception.
- A model download, WebGPU initialization, or inference timeout must not block editing. Return no semantic result and continue with the existing visual/temporal heuristic pipeline.
- Keep the inference input bounded to a small set of representative frames; do not decode an entire long video into memory.
- Do not describe frame classification as action recognition. A frame label such as “sports car” does not prove a drift, a kill, a cooking step, or any other temporal event.
- Local preference and quality feedback must stay on-device unless the user explicitly chooses an export or sync feature.

## Honest capability levels

1. **Available now:** sampled-frame image classification, broad content profile, visual motion/contrast heuristics, evidence timestamps, style-aware highlight ranking.
2. **Not guaranteed by the current classifier:** detailed temporal action recognition, identity tracking, game-event understanding, exact action boundaries, or natural-language video understanding.
3. **Future optional enhancement:** evaluate an open-licensed temporal/action model that can realistically run on supported devices. Verify model license, model format/runtime compatibility, memory use, model size, latency, and quality on representative footage before integration.

## Acceptance checks for every perception change

- Works without API credentials and without paid provider configuration.
- Empty/invalid frame input returns safely without loading a model.
- Model load/inference failure falls back to the existing montage analysis.
- No source media is transmitted by the default analysis path.
- Test photos, short clips, long clips, mixed scenes, gaming footage, car/drift footage, and low-motion footage.
- Compare selected moments against a human-reviewed baseline; do not promote a model based on speed or confidence alone.
- Keep changes on a test branch until checks pass and a human approves the result.

## Cost and privacy boundary

“Free-first” means the application does not require a paid inference API for its default path. It cannot promise unlimited internet bandwidth, zero device power use, identical speed on every Android phone, or that every optional third-party service will remain free forever.
