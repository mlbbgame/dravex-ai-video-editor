import { expect, test } from "@playwright/test";
import { buildMixedMediaSequence } from "../src/video/mixed-media-planner";
import type { VideoSegment } from "../src/video/video-sequence-render";

const videoCuts: VideoSegment[] = [
  { name: "source.mp4", url: "blob:source", trimStart: 0, trimEnd: 10 },
  { name: "source.mp4", url: "blob:source", trimStart: 10, trimEnd: 20 },
];

test("mixed-media sequence preserves selected order and fits its target duration", () => {
  const sequence = buildMixedMediaSequence(
    [
      { kind: "image", name: "first.jpg", url: "blob:first" },
      { kind: "video", name: "source.mp4", url: "blob:source" },
      { kind: "image", name: "last.jpg", url: "blob:last" },
    ],
    videoCuts,
    6,
  );

  expect(sequence.map((segment) => segment.name)).toEqual([
    "first.jpg",
    "source.mp4",
    "source.mp4",
    "last.jpg",
  ]);
  expect(sequence[0]).toMatchObject({ kind: "image", duration: 1.6 });
  expect(sequence[3]).toMatchObject({ kind: "image", duration: 1.6 });
  const videoDuration = sequence
    .filter((segment) => segment.kind === "video")
    .reduce((sum, segment) => {
      if (segment.kind !== "video") return sum;
      return sum + (segment.trimEnd - segment.trimStart) / (segment.speedFactor ?? 1);
    }, 0);
  expect(videoDuration).toBeCloseTo(2.8, 5);
  expect(sequence.reduce((sum, segment) => sum + (
    segment.kind === "image" ? segment.duration : (segment.trimEnd - segment.trimStart) / (segment.speedFactor ?? 1)
  ), 0)).toBeCloseTo(6, 5);
});

test("mixed-media planner rejects invalid targets and incomplete source selections", () => {
  const order = [
    { kind: "image" as const, name: "photo.jpg", url: "blob:photo" },
    { kind: "video" as const, name: "source.mp4", url: "blob:source" },
  ];

  expect(buildMixedMediaSequence(order, videoCuts, 0)).toEqual([]);
  expect(buildMixedMediaSequence(order, videoCuts, Number.NaN)).toEqual([]);
  expect(buildMixedMediaSequence(order, videoCuts, Number.POSITIVE_INFINITY)).toEqual([]);
  expect(buildMixedMediaSequence(order, [], 5)).toEqual([]);
  expect(buildMixedMediaSequence(
    [{ kind: "image", name: "photo.jpg", url: "blob:photo" }],
    videoCuts,
    5,
  )).toEqual([]);
});

test("mixed-media planner keeps every video trim inside its original bounds when shortening clips", () => {
  const longCuts: VideoSegment[] = [
    { name: "source.mp4", url: "blob:source", trimStart: 2, trimEnd: 12 },
    { name: "source.mp4", url: "blob:source", trimStart: 20, trimEnd: 30 },
  ];
  const sequence = buildMixedMediaSequence(
    [
      { kind: "video", name: "source.mp4", url: "blob:source" },
      { kind: "image", name: "photo.jpg", url: "blob:photo" },
    ],
    longCuts,
    4,
  );
  const clips = sequence.filter((segment) => segment.kind === "video");

  expect(clips).toHaveLength(2);
  for (const clip of clips) {
    if (clip.kind !== "video") continue;
    expect(clip.trimStart).toBeGreaterThanOrEqual(0);
    expect(clip.trimEnd).toBeGreaterThan(clip.trimStart);
  }
  expect(clips[0].trimStart).toBeCloseTo(6.4, 8);
  expect(clips[0].trimEnd).toBeCloseTo(7.6, 8);
  expect(clips[1].trimStart).toBeCloseTo(24.4, 8);
  expect(clips[1].trimEnd).toBeCloseTo(25.6, 8);
});
