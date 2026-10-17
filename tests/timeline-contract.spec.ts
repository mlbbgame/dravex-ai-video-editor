import { expect, test } from "@playwright/test";
import { validateEditTimeline, type EditTimeline, type TimelineSource } from "../src/video/timeline-contract";

const sources: TimelineSource[] = [
  { id: "video-1", kind: "video", duration: 20 },
  { id: "image-1", kind: "image" },
  { id: "music-1", kind: "audio", duration: 30 },
];

const validTimeline: EditTimeline = {
  schemaVersion: 1,
  targetDuration: 8,
  aspectRatio: "9:16",
  resolution: "1080p",
  frameRate: 30,
  clips: [
    {
      id: "clip-1",
      sourceId: "video-1",
      kind: "video",
      timelineStart: 0,
      timelineEnd: 4,
      sourceRange: { start: 2, end: 10 },
      playbackRate: 2,
    },
    {
      id: "clip-2",
      sourceId: "image-1",
      kind: "image",
      timelineStart: 4,
      timelineEnd: 8,
      playbackRate: 1,
    },
  ],
  audioTracks: [
    {
      id: "audio-1",
      sourceId: "music-1",
      timelineStart: 0,
      timelineEnd: 8,
      sourceRange: { start: 5, end: 13 },
      gain: 0.7,
      fadeInSeconds: 0.4,
      fadeOutSeconds: 1,
    },
  ],
};

test("validates a canonical mixed-media timeline", () => {
  expect(validateEditTimeline(validTimeline, sources)).toEqual({ valid: true, errors: [] });
});

test("rejects video source ranges outside the probed source duration", () => {
  const invalid = structuredClone(validTimeline);
  invalid.clips[0] = { ...invalid.clips[0], sourceRange: { start: 18, end: 22 } } as typeof invalid.clips[number];
  const result = validateEditTimeline(invalid, sources);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Clip 1 source range exceeds the source duration.");
});

test("rejects a timeline gap that could produce unintended blank frames", () => {
  const invalid = structuredClone(validTimeline);
  invalid.clips[1] = { ...invalid.clips[1], timelineStart: 4.5, timelineEnd: 8 } as typeof invalid.clips[number];
  const result = validateEditTimeline(invalid, sources);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Clip 2 must begin where the previous clip ends; gaps and overlaps are not supported in schema v1.");
});

test("rejects mismatch between source duration, playback rate, and timeline duration", () => {
  const invalid = structuredClone(validTimeline);
  invalid.clips[0] = { ...invalid.clips[0], timelineEnd: 3.5 } as typeof invalid.clips[number];
  invalid.clips[1] = { ...invalid.clips[1], timelineStart: 3.5, timelineEnd: 8 } as typeof invalid.clips[number];
  const result = validateEditTimeline(invalid, sources);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Clip 1 timeline duration does not match its source range and playback rate.");
});

test("rejects audio fades longer than the track", () => {
  const invalid = structuredClone(validTimeline);
  invalid.audioTracks[0] = { ...invalid.audioTracks[0], fadeInSeconds: 5, fadeOutSeconds: 5 };
  const result = validateEditTimeline(invalid, sources);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Audio track 1 fade-in and fade-out exceed the track duration.");
});

test("rejects media-kind mismatches and unknown sources", () => {
  const invalid = structuredClone(validTimeline);
  invalid.clips[0] = { ...invalid.clips[0], sourceId: "music-1" };
  invalid.clips[1] = { ...invalid.clips[1], sourceId: "missing-image" };
  const result = validateEditTimeline(invalid, sources);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Clip 1 media kind does not match its source.");
  expect(result.errors).toContain("Clip 2 references an unknown source.");
});

test("rejects duplicated timeline IDs", () => {
  const invalid = structuredClone(validTimeline);
  invalid.audioTracks[0] = { ...invalid.audioTracks[0], id: "clip-1" };
  const result = validateEditTimeline(invalid, sources);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain('Timeline item ID "clip-1" is duplicated.');
});

test("rejects excessive clip counts before rendering", () => {
  const invalid = {
    ...validTimeline,
    clips: Array.from({ length: 241 }, (_, index) => ({
      ...validTimeline.clips[0],
      id: `clip-${index}`,
      timelineStart: index * 4,
      timelineEnd: (index + 1) * 4,
      sourceRange: { start: 0, end: 8 },
      playbackRate: 2,
    })),
    targetDuration: 964,
  };
  const result = validateEditTimeline(invalid, sources);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Timeline cannot contain more than 240 clips.");
});
