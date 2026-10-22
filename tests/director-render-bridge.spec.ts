import { expect, test } from "@playwright/test";
import type { DirectorMontagePlan } from "../src/video/ai-director-contract";
import { directorPlanToVideoSegments } from "../src/video/director-render-bridge";

const plan: DirectorMontagePlan = {
  contractVersion: 1,
  id: "plan-1",
  style: "velocity",
  output: {
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    includeOriginalAudio: true,
    includeMusic: true,
    includeBackgroundAudio: false,
  },
  clips: [
    { id: "clip-1", sourceId: "source-video", sourceStartSeconds: 1.25, sourceEndSeconds: 2.75, speedFactor: 1.5 },
    { id: "clip-2", sourceId: "other-source", sourceStartSeconds: 3, sourceEndSeconds: 4, speedFactor: 1 },
    { id: "clip-3", sourceId: "source-video", sourceStartSeconds: 7, sourceEndSeconds: 9, speedFactor: 0.75 },
  ],
};

test("maps plan trims to native renderer segments without changing their boundaries", () => {
  expect(directorPlanToVideoSegments(plan, "source-video", "source.mp4", "blob:video")).toEqual([
    { name: "source.mp4", url: "blob:video", trimStart: 1.25, trimEnd: 2.75, speedFactor: 1.5 },
    { name: "source.mp4", url: "blob:video", trimStart: 7, trimEnd: 9, speedFactor: 0.75 },
  ]);
});

test("rejects malformed clip ranges and caps renderer segments", () => {
  const malformed = {
    ...plan,
    clips: [
      ...plan.clips,
      { id: "bad", sourceId: "source-video", sourceStartSeconds: 4, sourceEndSeconds: 4, speedFactor: 1 },
    ],
  };
  expect(directorPlanToVideoSegments(malformed, "source-video", "source.mp4", "blob:video")).toHaveLength(2);

  const many = { ...plan, clips: Array.from({ length: 250 }, (_, index) => ({
    id: `clip-${index}`,
    sourceId: "source-video",
    sourceStartSeconds: index,
    sourceEndSeconds: index + 0.5,
    speedFactor: 1,
  })) };
  expect(directorPlanToVideoSegments(many, "source-video", "source.mp4", "blob:video")).toHaveLength(200);
});

test("returns no segments for a mismatched source or missing media URL", () => {
  expect(directorPlanToVideoSegments(plan, "missing-source", "source.mp4", "blob:video")).toEqual([]);
  expect(directorPlanToVideoSegments(plan, "source-video", "source.mp4", "")).toEqual([]);
});

test("rejects non-finite or out-of-range Director speed factors", () => {
  const invalid = {
    ...plan,
    clips: [
      { ...plan.clips[0], speedFactor: 0 },
      { ...plan.clips[2], speedFactor: 5 },
      { ...plan.clips[0], speedFactor: Number.NaN },
    ],
  };
  expect(directorPlanToVideoSegments(invalid, "source-video", "source.mp4", "blob:video")).toEqual([]);
});
