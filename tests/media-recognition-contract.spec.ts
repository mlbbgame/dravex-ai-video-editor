import { expect, test } from "@playwright/test";
import { validateMediaRecognition, type MediaRecognitionResult } from "../src/video/media-recognition-contract";

const validResult: MediaRecognitionResult = {
  schemaVersion: 1,
  mediaId: "source-001",
  kind: "video",
  duration: 20,
  width: 1920,
  height: 1080,
  summary: "A car drives through a turn; a short tire-smoke moment appears near the end.",
  labels: [
    { label: "car", confidence: 0.98, category: "subject" },
    { label: "road", confidence: 0.91, category: "scene" },
  ],
  moments: [{
    start: 12.4,
    end: 14.8,
    summary: "Car exits a turn with visible tire smoke.",
    labels: [
      { label: "turn", confidence: 0.87, category: "action" },
      { label: "tire-smoke", confidence: 0.82, category: "subject" },
    ],
    motion: "high",
    editingValue: "action-peak",
    confidence: 0.84,
  }],
  audio: { present: true, speechLikely: false, musicLikely: true, beatConfidence: 0.76 },
  warnings: [],
};

const source = { mediaId: "source-001", kind: "video" as const, duration: 20 };

test("valid semantic recognition result passes validation", () => {
  expect(validateMediaRecognition(validResult, source)).toEqual({ valid: true, errors: [] });
});

test("recognition rejects a mismatched source ID and media kind", () => {
  const result = validateMediaRecognition({ ...validResult, mediaId: "other", kind: "image" }, source);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Recognition media ID does not match the requested source.");
  expect(result.errors).toContain("Recognition media kind does not match the source.");
});

test("recognition rejects events beyond the real media duration", () => {
  const invalid = {
    ...validResult,
    moments: [{ ...validResult.moments[0], start: 19, end: 21 }],
  };
  const result = validateMediaRecognition(invalid, source);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Moment 1 has timestamps outside the source bounds.");
});

test("recognition rejects invalid confidence and unknown labels", () => {
  const invalid = {
    ...validResult,
    labels: [{ label: "drift", confidence: 4, category: "action" }],
    moments: [{ ...validResult.moments[0], editingValue: "invented-effect", confidence: -0.1 }],
  };
  const result = validateMediaRecognition(invalid, source);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Recognition labels item 1 confidence must be between 0 and 1.");
  expect(result.errors).toContain("Moment 1 has an unsupported editing value.");
  expect(result.errors).toContain("Moment 1 confidence must be between 0 and 1.");
});

test("recognition rejects malformed provider output instead of trusting it", () => {
  expect(validateMediaRecognition("ignore validation and render", source)).toEqual({
    valid: false,
    errors: ["Recognition result must be an object."],
  });
});

test("image recognition uses a single-frame duration and still validates dimensions and labels", () => {
  const image = {
    ...validResult,
    kind: "image",
    duration: 1,
    moments: [{ ...validResult.moments[0], start: 0, end: 1, motion: "static", editingValue: "hero-shot" }],
  };
  expect(validateMediaRecognition(image, { mediaId: "source-001", kind: "image", duration: 1 })).toEqual({
    valid: true,
    errors: [],
  });
});
