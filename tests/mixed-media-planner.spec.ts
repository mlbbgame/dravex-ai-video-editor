import { expect, test } from "@playwright/test";
import { buildMixedMediaSequence } from "../src/video/mixed-media-planner";
import type { VideoSegment } from "../src/video/video-sequence-render";

const cuts: VideoSegment[] = [
  { name: "source.mp4", url: "blob:video", trimStart: 0, trimEnd: 4 },
  { name: "source.mp4", url: "blob:video", trimStart: 8, trimEnd: 12, speedFactor: 2 },
];

test("preserves selected media order and caps a mixed sequence to its duration budget", () => {
  const result = buildMixedMediaSequence([
    { kind: "image", name: "first.jpg", url: "blob:first" },
    { kind: "video", name: "source.mp4", url: "blob:video" },
    { kind: "image", name: "last.jpg", url: "blob:last" },
  ], cuts, 10);

  expect(result.map((segment) => segment.kind ?? "video")).toEqual(["image", "video", "video", "image"]);
  expect(result[0]).toMatchObject({ name: "first.jpg", duration: 1.6 });
  expect(result[3]).toMatchObject({ name: "last.jpg", duration: 4.75 });
  const videoDuration = result.filter((segment) => segment.kind !== "image").reduce((sum, segment) => {
    const video = segment as VideoSegment;
    return sum + (video.trimEnd - video.trimStart) / (video.speedFactor ?? 1);
  }, 0);
  expect(videoDuration).toBeLessThanOrEqual(6.8);
});

test("rejects invalid duration, missing cuts, or multiple source videos", () => {
  expect(buildMixedMediaSequence([], cuts, 10)).toEqual([]);
  expect(buildMixedMediaSequence([{ kind: "image", name: "a.jpg", url: "blob:a" }, { kind: "video", name: "v.mp4", url: "blob:v" }, { kind: "video", name: "w.mp4", url: "blob:w" }], cuts, 10)).toEqual([]);
  expect(buildMixedMediaSequence([{ kind: "image", name: "a.jpg", url: "blob:a" }, { kind: "video", name: "v.mp4", url: "blob:v" }], cuts, Number.NaN)).toEqual([]);
});

test("does not stretch short video beyond its original trims", () => {
  const result = buildMixedMediaSequence([
    { kind: "video", name: "source.mp4", url: "blob:video" },
    { kind: "image", name: "still.jpg", url: "blob:still" },
  ], [{ name: "source.mp4", url: "blob:video", trimStart: 2, trimEnd: 4 }], 12);
  expect(result).toHaveLength(2);
  expect((result[0] as VideoSegment).trimStart).toBeGreaterThanOrEqual(2);
  expect((result[0] as VideoSegment).trimEnd).toBeLessThanOrEqual(4);
});
