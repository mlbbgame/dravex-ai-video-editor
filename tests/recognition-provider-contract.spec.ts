import { expect, test } from "@playwright/test";
import {
  runRecognitionPipeline,
  type RecognitionProvider,
  type RecognitionProviderRequest,
} from "../src/video/recognition-provider-contract";
import type { MediaRecognitionResult } from "../src/video/media-recognition-contract";

const request: RecognitionProviderRequest = {
  source: {
    mediaId: "media-01",
    kind: "video",
    duration: 12,
    width: 1280,
    height: 720,
    mimeType: "video/mp4",
    sizeBytes: 5_000_000,
    hasAudio: true,
  },
  coarseFrames: [
    { timestamp: 0, assetReference: "private-frame-start" },
    { timestamp: 12, assetReference: "private-frame-end" },
  ],
};

const validRecognition: MediaRecognitionResult = {
  schemaVersion: 1,
  mediaId: "media-01",
  kind: "video",
  duration: 12,
  width: 1280,
  height: 720,
  summary: "A person walks along a coastal path.",
  labels: [{ label: "coast", confidence: 0.94, category: "scene" }],
  moments: [{
    start: 3,
    end: 6,
    summary: "The person passes a rocky viewpoint.",
    labels: [{ label: "walking", confidence: 0.85, category: "action" }],
    motion: "medium",
    editingValue: "hero-shot",
    confidence: 0.84,
  }],
  audio: { present: true, speechLikely: false, musicLikely: false, beatConfidence: 0.1 },
  warnings: [],
};

function providerWith(output: unknown): RecognitionProvider {
  return { id: "test-provider", recognize: async () => output };
}

test("provider adapter output is validated before it reaches the director", async () => {
  const result = await runRecognitionPipeline(providerWith(validRecognition), request);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.providerId).toBe("test-provider");
    expect(result.result.mediaId).toBe("media-01");
  }
});

test("malformed or mismatched provider output is rejected", async () => {
  const result = await runRecognitionPipeline(
    providerWith({ ...validRecognition, mediaId: "different-source" }),
    request,
  );
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.validation.errors).toContain("Recognition media ID does not match the requested source.");
  }
});

test("invalid source bounds and oversized requests are rejected before provider calls", async () => {
  let called = false;
  const provider: RecognitionProvider = {
    id: "must-not-run",
    recognize: async () => {
      called = true;
      return validRecognition;
    },
  };
  const invalidRequest = {
    ...request,
    coarseFrames: Array.from({ length: 241 }, (_, timestamp) => ({
      timestamp,
      assetReference: `frame-${timestamp}`,
    })),
  };
  const result = await runRecognitionPipeline(provider, invalidRequest);
  expect(result.ok).toBe(false);
  expect(called).toBe(false);
  if (!result.ok) {
    expect(result.validation.errors).toContain("Total recognition frame count exceeds the 240-frame cap.");
  }
});

test("frame timestamps outside the probed source are rejected", async () => {
  const result = await runRecognitionPipeline(providerWith(validRecognition), {
    ...request,
    coarseFrames: [{ timestamp: 99, assetReference: "out-of-bounds-frame" }],
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.validation.errors).toContain("Frame 1 timestamp is outside the source bounds.");
  }
});
