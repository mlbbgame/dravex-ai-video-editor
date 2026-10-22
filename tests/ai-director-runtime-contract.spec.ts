import { expect, test } from "@playwright/test";
import { buildDirectorMontagePlan, type DirectedMoment } from "../src/video/ai-director";
import type { DirectorSourceAsset } from "../src/video/ai-director-contract";

const source: DirectorSourceAsset = {
  id: "video-1",
  kind: "video",
  durationSeconds: 12,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
};

const candidates: DirectedMoment[] = [{
  time: 3,
  start: 2,
  end: 4,
  score: 0.91,
  motion: 0.4,
  contrast: 0.6,
  sceneLabels: ["car"],
  actionCues: ["Резкое движение"],
  directorScore: 0.91,
}];

const output = {
  aspectRatio: "9:16" as const,
  width: 1080,
  height: 1920,
  fps: 30,
  includeOriginalAudio: true,
  includeMusic: true,
  includeBackgroundAudio: false,
};

test("converts analyzed moments to a valid versioned render plan", () => {
  const result = buildDirectorMontagePlan({
    id: "plan-1",
    source,
    candidates,
    style: "velocity",
    output,
  });

  expect(result.validation).toEqual({ valid: true, issues: [] });
  expect(result.plan?.contractVersion).toBe(1);
  expect(result.plan?.style).toBe("velocity");
  expect(result.plan?.clips).toHaveLength(1);
  expect(result.plan?.clips[0]).toMatchObject({
    sourceId: "video-1",
    sourceStartSeconds: 2,
    sourceEndSeconds: 4,
    speedFactor: 1,
  });
  expect(result.plan?.evidence?.map((item) => item.kind)).toEqual(["object", "motion"]);
});

test("refuses to return a plan when an analyzed trim exceeds source duration", () => {
  const result = buildDirectorMontagePlan({
    id: "plan-invalid",
    source,
    candidates: [{ ...candidates[0], end: 15 }],
    style: "cinematic",
    output,
  });

  expect(result.plan).toBeNull();
  expect(result.validation.valid).toBe(false);
  expect(result.validation.issues).toContain("clips[0] exceeds source duration.");
});

test("refuses an empty candidate list instead of creating an empty montage", () => {
  const result = buildDirectorMontagePlan({
    id: "plan-empty",
    source,
    candidates: [],
    style: "cinematic",
    output,
  });

  expect(result.plan).toBeNull();
  expect(result.validation.issues).toContain("Plan must contain at least one clip.");
});
