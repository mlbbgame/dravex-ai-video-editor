import { expect, test } from "@playwright/test";
import {
  validateDirectorMontagePlan,
  validateDirectorQualityReport,
  type DirectorSourceAsset,
} from "../src/video/ai-director-contract";

const sources: DirectorSourceAsset[] = [{
  id: "source-1", kind: "video", durationSeconds: 12,
  width: 1920, height: 1080, hasAudio: true,
}];
const plan = {
  contractVersion: 1, id: "plan-1", style: "cinematic",
  clips: [{
    id: "clip-1", sourceId: "source-1",
    sourceStartSeconds: 1, sourceEndSeconds: 5, speedFactor: 1,
    transitionOutSeconds: 0.5, effects: ["color-grade"],
  }],
  output: {
    aspectRatio: "9:16", width: 1080, height: 1920, fps: 30,
    includeOriginalAudio: true, includeMusic: true, includeBackgroundAudio: false,
  },
};

test("accepts a valid montage plan", () => {
  expect(validateDirectorMontagePlan(plan, sources)).toEqual({ valid: true, issues: [] });
});
test("rejects source ranges beyond source duration", () => {
  const result = validateDirectorMontagePlan({
    ...plan, clips: [{ ...plan.clips[0], sourceEndSeconds: 15 }],
  }, sources);
  expect(result.valid).toBe(false);
  expect(result.issues).toContain("clips[0] exceeds source duration.");
});
test("rejects duplicate clip ids and invalid speed", () => {
  const result = validateDirectorMontagePlan({
    ...plan,
    clips: [
      plan.clips[0],
      { ...plan.clips[0], sourceStartSeconds: 5, sourceEndSeconds: 8, speedFactor: 8 },
    ],
  }, sources);
  expect(result.valid).toBe(false);
  expect(result.issues).toContain("clips[1].id must be unique.");
  expect(result.issues).toContain("clips[1].speedFactor must be between 0.25 and 4.");
});
test("requires all six quality dimensions in range", () => {
  const result = validateDirectorQualityReport({
    momentSelection: 90, pacing: 80, transitions: 80, musicSync: 70,
    visualConsistency: 101,
  });
  expect(result.valid).toBe(false);
  expect(result.issues).toContain("Quality score visualConsistency must be a finite number from 0 to 100.");
  expect(result.issues).toContain("Quality score technicalReliability must be a finite number from 0 to 100.");
});
