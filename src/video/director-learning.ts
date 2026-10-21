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
  /** All scores use the same 0..1 scale and same benchmark set. */
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
  if (!input.id.trim()) errors.push("Experience ID is required.");
  if (!Number.isFinite(Date.parse(input.createdAt))) errors.push("createdAt must be a valid date.");
  if (!["aggressive-car", "cinematic-travel", "nature-wildlife", "food-cooking", "people-everyday", "product-diy", "gaming", "sports", "anime", "general"].includes(input.profile)) {
    errors.push("Unknown learning profile.");
  }
  if (!["hype", "cinematic", "emotion", "signature"].includes(input.variant)) errors.push("Unknown montage variant.");
  for (const [dimension, score] of Object.entries(input.quality)) {
    if (!dimensions.includes(dimension as keyof MontageQuality) || !validScore(score)) {
      errors.push(`Invalid quality score for ${dimension}.`);
    }
  }
  if (input.editedDimensions?.some((dimension) => !dimensions.includes(dimension))) {
    errors.push("Unknown edited quality dimension.");
  }
  return errors;
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

  for (const [key, value] of Object.entries(candidateValues)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      reasons.push(`Candidate tuning '${key}' must be between 0 and 1.`);
    }
  }
  if (!validScore(benchmark.baselineScore) || !validScore(benchmark.candidateScore)) {
    reasons.push("Benchmark scores must be between 0 and 1.");
  } else if (benchmark.candidateScore < benchmark.baselineScore + minimumGain) {
    reasons.push(`Candidate improvement must be at least ${minimumGain.toFixed(2)}.`);
  }
  for (const [dimension, regression] of Object.entries(benchmark.baselineRegressionByDimension)) {
    if (!Number.isFinite(regression) || regression < 0) {
      reasons.push(`Regression for ${dimension} must be a non-negative number.`);
    } else if (regression > maximumDimensionRegression) {
      reasons.push(`Regression for ${dimension} exceeds the allowed limit.`);
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
