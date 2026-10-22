/**
 * DRAVEX AI Director: experience memory and guarded self-improvement.
 *
 * This module learns from explicit, non-sensitive edit feedback and quality
 * measurements. It does not train model weights or silently rewrite code.
 * It can recommend experiments and promote a tuning profile only when a
 * benchmark reports a measurable improvement without unacceptable regressions.
 */

export type LearningProfileId =
  | "aggressive-car"
  | "cinematic-travel"
  | "nature-wildlife"
  | "food-cooking"
  | "people-everyday"
  | "product-diy"
  | "gaming"
  | "sports"
  | "anime"
  | "general";

export type MontageVariantId = "hype" | "cinematic" | "emotion" | "signature";

export type MontageQuality = {
  momentSelection: number;
  pacing: number;
  transitions: number;
  musicSync: number;
  visualConsistency: number;
  technicalReliability: number;
};

export type MontageExperience = {
  id: string;
  createdAt: string;
  profile: LearningProfileId;
  variant: MontageVariantId;
  /** Scores are normalized from 0 to 1. Unknown dimensions should be omitted by the caller. */
  quality: Partial<MontageQuality>;
  /** Explicit user signals; absence is not interpreted as dislike. */
  selectedByUser?: boolean;
  exportedByUser?: boolean;
  rejectedByUser?: boolean;
  editedDimensions?: Array<keyof MontageQuality>;
  /** A coarse content label only; do not put source media, names, or URLs here. */
  contentKind?: string;
};

export type LearningObservation = {
  dimension: keyof MontageQuality;
  samples: number;
  mean: number;
  userEditRate: number;
  rejectionRate: number;
};

export type ImprovementHypothesis = {
  id: string;
  profile: LearningProfileId;
  dimension: keyof MontageQuality;
  title: string;
  rationale: string;
  baselineMean: number;
  sampleCount: number;
  proposedAction: string;
  status: "proposed" | "testing" | "accepted" | "rejected";
};

export type TuningProfile = {
  version: number;
  /** Values are bounded, interpretable knobs consumed by the planner, not model weights. */
  values: Record<string, number>;
};

export type BenchmarkResult = {
  baselineScore: number;
  candidateScore: number;
  baselineRegressionByDimension: Record<string, number>;
  /** Ordered stable IDs prove both versions used identical test clips. */
  baselineSampleIds: string[];
  candidateSampleIds: string[];
};

export interface ExperienceStore {
  load(): Promise<MontageExperience[]>;
  append(experience: MontageExperience): Promise<void>;
}

export interface TuningStore {
  load(profile: LearningProfileId): Promise<TuningProfile>;
  save(profile: LearningProfileId, tuning: TuningProfile): Promise<void>;
}

const dimensions: Array<keyof MontageQuality> = [
  "momentSelection",
  "pacing",
  "transitions",
  "musicSync",
  "visualConsistency",
  "technicalReliability",
];

const dimensionLabels: Record<keyof MontageQuality, string> = {
  momentSelection: "Moment selection",
  pacing: "Pacing",
  transitions: "Transitions",
  musicSync: "Music synchronization",
  visualConsistency: "Visual consistency",
  technicalReliability: "Technical reliability",
};

function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateExperience(input: MontageExperience): string[] {
  const errors: string[] = [];
  // Storage is untrusted input: a partial/corrupt row must be rejected safely,
  // not throw and cause the caller to lose every otherwise valid record.
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ["Experience must be an object."];
  }
  if (typeof input.id !== "string" || !input.id.trim() || input.id.length > 120) errors.push("Experience ID must be a non-empty string of at most 120 characters.");
  if (typeof input.createdAt !== "string" || !Number.isFinite(Date.parse(input.createdAt))) {
    errors.push("createdAt must be a valid date.");
  }
  if (!["aggressive-car", "cinematic-travel", "nature-wildlife", "food-cooking", "people-everyday", "product-diy", "gaming", "sports", "anime", "general"].includes(input.profile)) {
    errors.push("Unknown learning profile.");
  }
  if (!["hype", "cinematic", "emotion", "signature"].includes(input.variant)) errors.push("Unknown montage variant.");
  if (!input.quality || typeof input.quality !== "object" || Array.isArray(input.quality)) {
    errors.push("Quality scores must be an object.");
  } else {
    for (const [dimension, score] of Object.entries(input.quality)) {
      if (!dimensions.includes(dimension as keyof MontageQuality) || !validScore(score)) {
        errors.push(`Invalid quality score for ${dimension}.`);
      }
    }
  }
  if (input.editedDimensions !== undefined
    && (!Array.isArray(input.editedDimensions) || input.editedDimensions.some((dimension) => !dimensions.includes(dimension)))) {
    errors.push("Unknown edited quality dimension.");
  }
  for (const flag of ["selectedByUser", "exportedByUser", "rejectedByUser"] as const) {
    if (input[flag] !== undefined && typeof input[flag] !== "boolean") errors.push(`${flag} must be a boolean.`);
  }
  const allowedContentKinds = ["video", "images", "mixed", "gaming", "anime", "automotive", "nature", "food", "people", "sports", "wildlife", "product-diy", "general"] as const;
  if (input.contentKind !== undefined
    && (typeof input.contentKind !== "string" || !allowedContentKinds.includes(input.contentKind as typeof allowedContentKinds[number]))) {
    errors.push("contentKind must be a supported coarse category; file names and free-form text are not allowed.");
  }
  return errors;
}

export type PreferredVariantRecommendation = {
  variant: MontageVariantId;
  sampleCount: number;
  share: number;
};

/**
 * Strong scene evidence remains the primary director signal. Repeated explicit
 * preferences may guide auto mode when the semantic classifier is uncertain.
 * The score is a model confidence heuristic, not a calibrated probability.
 */
export function shouldApplyLearnedPreference(
  profile: string | undefined,
  confidence: number | undefined,
  confidenceThreshold = 0.78,
): boolean {
  if (!Number.isFinite(confidenceThreshold) || confidenceThreshold <= 0 || confidenceThreshold > 1) return false;
  if (!profile || profile === "unknown") return true;
  if (!Number.isFinite(confidence)) return true;
  return (confidence as number) < confidenceThreshold;
}

/**
 * Personalize auto mode only after repeated explicit choices and exports.
 * Low-sample or tied histories never override scene analysis.
 */
export function recommendPreferredVariant(
  experiences: readonly MontageExperience[],
  profile: LearningProfileId,
  minimumSamples = 3,
  minimumShare = 0.6,
): PreferredVariantRecommendation | null {
  if (!Number.isInteger(minimumSamples) || minimumSamples < 2
    || !Number.isFinite(minimumShare) || minimumShare <= 0.5 || minimumShare > 1) return null;
  const rows = experiences.filter((item) =>
    item.profile === profile
    && item.selectedByUser === true
    && item.exportedByUser === true
    && item.rejectedByUser !== true
  );
  if (rows.length < minimumSamples) return null;
  const counts = new Map<MontageVariantId, number>();
  for (const row of rows) counts.set(row.variant, (counts.get(row.variant) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const winner = ranked[0];
  if (!winner || (ranked[1] && ranked[1][1] === winner[1])) return null;
  const share = winner[1] / rows.length;
  if (share < minimumShare) return null;
  return { variant: winner[0], sampleCount: rows.length, share };
}

export function summarizeExperience(
  experiences: readonly MontageExperience[],
  profile: LearningProfileId,
  minimumSamples = 3,
): LearningObservation[] {
  return dimensions.flatMap((dimension) => {
    const rows = experiences.filter((item) =>
      item.profile === profile && validScore(item.quality[dimension]),
    );
    if (rows.length < minimumSamples) return [];
    return [{
      dimension,
      samples: rows.length,
      mean: rows.reduce((sum, row) => sum + (row.quality[dimension] as number), 0) / rows.length,
      userEditRate: rows.filter((row) => row.editedDimensions?.includes(dimension)).length / rows.length,
      rejectionRate: rows.filter((row) => row.rejectedByUser === true).length / rows.length,
    }];
  });
}

/** Generates testable hypotheses only after enough measured evidence exists. */
export function proposeImprovements(
  experiences: readonly MontageExperience[],
  profile: LearningProfileId,
  options: { minimumSamples?: number; weakScoreThreshold?: number; editRateThreshold?: number } = {},
): ImprovementHypothesis[] {
  const minimumSamples = options.minimumSamples ?? 5;
  const weakScoreThreshold = options.weakScoreThreshold ?? 0.62;
  const editRateThreshold = options.editRateThreshold ?? 0.35;
  return summarizeExperience(experiences, profile, minimumSamples)
    .filter((observation) =>
      observation.mean < weakScoreThreshold || observation.userEditRate >= editRateThreshold,
    )
    .map((observation) => {
      const userEdits = observation.userEditRate >= editRateThreshold;
      const label = dimensionLabels[observation.dimension];
      return {
        id: `${profile}:${observation.dimension}:v1`,
        profile,
        dimension: observation.dimension,
        title: `Improve ${label.toLowerCase()}`,
        rationale: userEdits
          ? `Users repeatedly edit this dimension (${Math.round(observation.userEditRate * 100)}% of ${observation.samples} measured montages).`
          : `Measured quality is ${observation.mean.toFixed(2)} across ${observation.samples} montages, below the target threshold.`,
        baselineMean: observation.mean,
        sampleCount: observation.samples,
        proposedAction: actionFor(observation.dimension),
        status: "proposed" as const,
      };
    });
}

function actionFor(dimension: keyof MontageQuality): string {
  const actions: Record<keyof MontageQuality, string> = {
    momentSelection: "Test alternative highlight-ranking weights against timestamped reference moments.",
    pacing: "Test a small set of clip-duration and pacing adjustments on the same source set.",
    transitions: "Compare transition density and motion-matching rules while preserving source continuity.",
    musicSync: "Test beat-anchor confidence thresholds and fallback pacing when beat confidence is low.",
    visualConsistency: "Compare restrained color-treatment presets across all clips in the same montage.",
    technicalReliability: "Prioritize render validation, malformed-input cases, and export/playback regression tests.",
  };
  return actions[dimension];
}

/**
 * Promotion is deliberately conservative: benchmark must be comparable,
 * candidate must improve overall score, and no dimension may regress past limit.
 */
export function evaluateTuningCandidate(
  current: TuningProfile,
  candidateValues: Record<string, number>,
  benchmark: BenchmarkResult,
  options: { minimumGain?: number; maximumDimensionRegression?: number } = {},
): { accepted: boolean; next: TuningProfile; reasons: string[] } {
  const minimumGain = options.minimumGain ?? 0.02;
  const maximumDimensionRegression = options.maximumDimensionRegression ?? 0.05;
  const reasons: string[] = [];

  if (!current || typeof current !== "object" || !Number.isInteger(current.version) || current.version < 1
    || !current.values || typeof current.values !== "object" || Array.isArray(current.values)) {
    reasons.push("Current tuning profile is malformed.");
  }
  if (!options || !Number.isFinite(minimumGain) || minimumGain < 0 || minimumGain > 1) {
    reasons.push("Minimum gain must be between 0 and 1.");
  }
  if (!Number.isFinite(maximumDimensionRegression)
    || maximumDimensionRegression < 0 || maximumDimensionRegression > 1) {
    reasons.push("Maximum dimension regression must be between 0 and 1.");
  }
  if (!candidateValues || typeof candidateValues !== "object" || Array.isArray(candidateValues)) {
    reasons.push("Candidate tuning values must be an object.");
  } else {
    for (const [key, value] of Object.entries(candidateValues)) {
      if (!key.trim() || !Number.isFinite(value) || value < 0 || value > 1) {
        reasons.push(`Candidate tuning '${key}' must be between 0 and 1.`);
      }
    }
  }
  if (!benchmark || typeof benchmark !== "object"
    || !validScore(benchmark.baselineScore) || !validScore(benchmark.candidateScore)) {
    reasons.push("Benchmark scores must be between 0 and 1.");
  } else {
    const baselineIds = benchmark.baselineSampleIds;
    const candidateIds = benchmark.candidateSampleIds;
    const validIds = (ids: unknown): ids is string[] => Array.isArray(ids)
      && ids.every((id) => typeof id === "string" && id.trim().length > 0 && id.length <= 120)
      && new Set(ids).size === ids.length;
    if (!validIds(baselineIds) || !validIds(candidateIds)
      || baselineIds.length < 5
      || baselineIds.length !== candidateIds.length
      || baselineIds.some((id, index) => id !== candidateIds[index])) {
      reasons.push("Benchmark must use at least 5 identical ordered sample IDs for both versions.");
    }
    if (!benchmark.baselineRegressionByDimension
      || typeof benchmark.baselineRegressionByDimension !== "object"
      || Array.isArray(benchmark.baselineRegressionByDimension)) {
      reasons.push("Dimension regressions must be provided as an object.");
    } else {
      const requiredDimensions: Array<keyof MontageQuality> = [
        "momentSelection", "pacing", "transitions", "musicSync",
        "visualConsistency", "technicalReliability",
      ];
      for (const dimension of requiredDimensions) {
        if (!Object.prototype.hasOwnProperty.call(benchmark.baselineRegressionByDimension, dimension)) {
          reasons.push(`Benchmark is missing regression data for ${dimension}.`);
        }
      }
      for (const [dimension, regression] of Object.entries(benchmark.baselineRegressionByDimension)) {
        if (!Number.isFinite(regression) || regression < 0 || regression > 1) {
          reasons.push(`Regression for ${dimension} must be between 0 and 1.`);
        } else if (regression > maximumDimensionRegression) {
          reasons.push(`Regression for ${dimension} exceeds the allowed limit.`);
        }
      }
    }
    if (Number.isFinite(minimumGain) && minimumGain >= 0 && minimumGain <= 1
      && benchmark.candidateScore < benchmark.baselineScore + minimumGain) {
      reasons.push(`Candidate improvement must be at least ${minimumGain.toFixed(2)}.`);
    }
  }

  const accepted = reasons.length === 0;
  return {
    accepted,
    next: accepted
      ? { version: current.version + 1, values: { ...current.values, ...candidateValues } }
      : current,
    reasons,
  };
}

/** Simple adapter so app code can provide localStorage, IndexedDB, or a test store. */
export class JsonLocalExperienceStore implements ExperienceStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem">, private readonly key = "dravex:director-experience:v1") {}

  async load(): Promise<MontageExperience[]> {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(this.key) ?? "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((row): row is MontageExperience =>
        typeof row === "object" && row !== null && validateExperience(row as MontageExperience).length === 0,
      );
    } catch {
      return [];
    }
  }

  async append(experience: MontageExperience): Promise<void> {
    const errors = validateExperience(experience);
    if (errors.length) throw new Error(`Invalid montage experience: ${errors.join(" ")}`);
    const current = await this.load();
    if (current.some((item) => item.id === experience.id)) return;
    current.push(experience);
    // Keep a bounded, useful history rather than accumulating indefinitely.
    const bounded = current.slice(-500);
    this.storage.setItem(this.key, JSON.stringify(bounded));
  }
}

/** In-memory tuning store for tests and prototypes; production persistence is injected. */
export class MemoryTuningStore implements TuningStore {
  private readonly profiles = new Map<LearningProfileId, TuningProfile>();

  async load(profile: LearningProfileId): Promise<TuningProfile> {
    const existing = this.profiles.get(profile);
    return existing ? { version: existing.version, values: { ...existing.values } } : { version: 1, values: {} };
  }

  async save(profile: LearningProfileId, tuning: TuningProfile): Promise<void> {
    this.profiles.set(profile, { version: tuning.version, values: { ...tuning.values } });
  }
}
