import { expect, test } from "@playwright/test";
import {
  evaluateTuningCandidate,
  JsonLocalExperienceStore,
  proposeImprovements,
  recommendPreferredVariant,
  shouldApplyLearnedPreference,
  summarizeExperience,
  validateExperience,
  type MontageExperience,
} from "../src/video/director-learning";

function experience(index: number, overrides: Partial<MontageExperience> = {}): MontageExperience {
  return {
    id: `exp-${index}`,
    createdAt: "2026-10-21T10:00:00.000Z",
    profile: "aggressive-car",
    variant: "hype",
    quality: {
      momentSelection: 0.8,
      pacing: 0.8,
      transitions: 0.8,
      musicSync: 0.8,
      visualConsistency: 0.8,
      technicalReliability: 1,
    },
    ...overrides,
  };
}

test("experience validation rejects invalid scores and dates", () => {
  expect(validateExperience(experience(1, {
    createdAt: "not-a-date",
    quality: { pacing: 1.5 },
  }))).toEqual([
    "createdAt must be a valid date.",
    "Invalid quality score for pacing.",
  ]);
});


test("corrupt stored rows are skipped without discarding valid experience history", async () => {
  const valid = experience(42);
  const storage = {
    getItem: () => JSON.stringify([
      valid,
      null,
      { id: "broken-without-date", profile: "general", variant: "hype", quality: {} },
      { ...experience(43), quality: { pacing: 7 } },
    ]),
    setItem: () => undefined,
  };
  const store = new JsonLocalExperienceStore(storage);
  await expect(store.load()).resolves.toEqual([valid]);
});

test("experience validation rejects malformed objects without throwing", () => {
  expect(validateExperience(null as unknown as MontageExperience)).toEqual([
    "Experience must be an object.",
  ]);
  expect(validateExperience({ id: 4 } as unknown as MontageExperience)).toContain(
    "Experience ID must be a non-empty string of at most 120 characters.",
  );
});

test("summaries require a minimum sample count and stay profile-specific", () => {
  const rows = [
    experience(1, { quality: { pacing: 0.4 } }),
    experience(2, { quality: { pacing: 0.6 } }),
    experience(3, { quality: { pacing: 0.8 } }),
    experience(4, { profile: "nature-wildlife", quality: { pacing: 0.1 } }),
  ];
  expect(summarizeExperience(rows, "aggressive-car", 3)).toEqual([{
    dimension: "pacing",
    samples: 3,
    mean: 0.6,
    userEditRate: 0,
    rejectionRate: 0,
  }]);
});

test("repeated edits or low scores produce explicit improvement hypotheses", () => {
  const rows = Array.from({ length: 5 }, (_, index) => experience(index, {
    quality: { transitions: 0.7 },
    editedDimensions: ["transitions"],
  }));
  const hypotheses = proposeImprovements(rows, "aggressive-car");
  expect(hypotheses).toHaveLength(1);
  expect(hypotheses[0].dimension).toBe("transitions");
  expect(hypotheses[0].status).toBe("proposed");
  expect(hypotheses[0].proposedAction).toContain("transition");
});

test("candidate tuning is promoted only after measurable gain and no large regressions", () => {
  const current = { version: 2, values: { transitionDensity: 0.4 } };
  const sampleIds = ["clip-01", "clip-02", "clip-03", "clip-04", "clip-05"];
  const rejected = evaluateTuningCandidate(current, { transitionDensity: 0.6 }, {
    baselineScore: 0.7,
    candidateScore: 0.75,
    baselineRegressionByDimension: { musicSync: 0.08 },
    baselineSampleIds: sampleIds,
    candidateSampleIds: sampleIds,
  });
  expect(rejected.accepted).toBe(false);
  expect(rejected.next).toEqual(current);

  const accepted = evaluateTuningCandidate(current, { transitionDensity: 0.55 }, {
    baselineScore: 0.7,
    candidateScore: 0.74,
    baselineRegressionByDimension: { musicSync: 0.02 },
    baselineSampleIds: sampleIds,
    candidateSampleIds: sampleIds,
  });
  expect(accepted.accepted).toBe(true);
  expect(accepted.next.version).toBe(3);
  expect(accepted.next.values.transitionDensity).toBe(0.55);
});


test("tuning promotion rejects benchmarks that compare different source clips", () => {
  const current = { version: 2, values: { transitionDensity: 0.4 } };
  const baselineIds = ["clip-01", "clip-02", "clip-03", "clip-04", "clip-05"];
  const result = evaluateTuningCandidate(current, { transitionDensity: 0.6 }, {
    baselineScore: 0.7,
    candidateScore: 0.9,
    baselineRegressionByDimension: {},
    baselineSampleIds: baselineIds,
    candidateSampleIds: ["clip-01", "clip-02", "clip-03", "clip-04", "different-clip"],
  });

  expect(result.accepted).toBe(false);
  expect(result.next).toEqual(current);
  expect(result.reasons).toContain("Benchmark must use at least 5 identical ordered sample IDs for both versions.");
});

test("tuning promotion rejects benchmarks with too few clips or duplicate IDs", () => {
  const current = { version: 2, values: { transitionDensity: 0.4 } };
  const result = evaluateTuningCandidate(current, { transitionDensity: 0.6 }, {
    baselineScore: 0.7,
    candidateScore: 0.9,
    baselineRegressionByDimension: {},
    baselineSampleIds: ["clip-01", "clip-02", "clip-02", "clip-04"],
    candidateSampleIds: ["clip-01", "clip-02", "clip-02", "clip-04"],
  });

  expect(result.accepted).toBe(false);
  expect(result.next).toEqual(current);
  expect(result.reasons).toContain("Benchmark must use at least 5 identical ordered sample IDs for both versions.");
});

test("experience memory rejects free-form content labels that could contain private filenames", () => {
  expect(validateExperience(experience(90, { contentKind: "private-video.mp4" }))).toContain(
    "contentKind must be a supported coarse category; file names and free-form text are not allowed.",
  );
  expect(validateExperience(experience(91, { contentKind: "gaming" }))).toEqual([]);
  expect(validateExperience(experience(92, { id: "x".repeat(121) }))).toContain(
    "Experience ID must be a non-empty string of at most 120 characters.",
  );
});


test("preferred montage variant needs repeated explicit exports and a clear majority", () => {
  const rows = [
    experience(100, { variant: "hype", selectedByUser: true, exportedByUser: true }),
    experience(101, { variant: "hype", selectedByUser: true, exportedByUser: true }),
    experience(102, { variant: "hype", selectedByUser: true, exportedByUser: true }),
    experience(103, { variant: "cinematic", selectedByUser: true, exportedByUser: true }),
  ];
  expect(recommendPreferredVariant(rows.slice(0, 2), "aggressive-car")).toBeNull();
  expect(recommendPreferredVariant(rows, "aggressive-car")).toEqual({
    variant: "hype",
    sampleCount: 4,
    share: 0.75,
  });
});

test("preferred montage variant ignores unselected exports, rejected edits, and tied preferences", () => {
  const rows = [
    experience(110, { variant: "hype", exportedByUser: true }),
    experience(111, { variant: "hype", selectedByUser: true, exportedByUser: true, rejectedByUser: true }),
    experience(112, { variant: "hype", selectedByUser: true, exportedByUser: true }),
    experience(113, { variant: "cinematic", selectedByUser: true, exportedByUser: true }),
    experience(114, { variant: "emotion", selectedByUser: true, exportedByUser: true }),
  ];
  expect(recommendPreferredVariant(rows, "aggressive-car")).toBeNull();
  expect(recommendPreferredVariant(rows, "gaming")).toBeNull();
});


test("learned preferences defer to strong semantic evidence but help when classification is uncertain", () => {
  expect(shouldApplyLearnedPreference("automotive", 0.92)).toBe(false);
  expect(shouldApplyLearnedPreference("automotive", 0.55)).toBe(true);
  expect(shouldApplyLearnedPreference("unknown", 0.99)).toBe(true);
  expect(shouldApplyLearnedPreference(undefined, undefined)).toBe(true);
  expect(shouldApplyLearnedPreference("nature", 0.5, Number.NaN)).toBe(false);
});


test("tuning promotion rejects malformed benchmark payloads and invalid thresholds safely", () => {
  const current = { version: 2, values: { transitionDensity: 0.4 } };
  const validBenchmark = {
    baselineScore: 0.7,
    candidateScore: 0.9,
    baselineRegressionByDimension: { musicSync: 0.01 },
  };

  const missingRegressions = evaluateTuningCandidate(current, { transitionDensity: 0.6 }, {
    ...validBenchmark,
    baselineRegressionByDimension: null as unknown as Record<string, number>,
  });
  expect(missingRegressions.accepted).toBe(false);
  expect(missingRegressions.next).toEqual(current);
  expect(missingRegressions.reasons).toContain("Dimension regressions must be provided as an object.");

  const invalidThreshold = evaluateTuningCandidate(current, { transitionDensity: 0.6 }, validBenchmark, {
    minimumGain: Number.NaN,
  });
  expect(invalidThreshold.accepted).toBe(false);
  expect(invalidThreshold.next).toEqual(current);
  expect(invalidThreshold.reasons).toContain("Minimum gain must be between 0 and 1.");

  expect(() => evaluateTuningCandidate(current, { transitionDensity: 0.6 }, null as never).accepted).not.toThrow();
});
