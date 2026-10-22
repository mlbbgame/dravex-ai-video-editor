/**
 * Versioned runtime contract for DRAVEX AI Director.
 *
 * This validates the boundary between analysis/planning and rendering. It does
 * not perform video analysis, render media, persist memory, or train models.
 */
export const AI_DIRECTOR_CONTRACT_VERSION = 1 as const;

export type DirectorStyle =
  | "velocity"
  | "cinematic"
  | "anime"
  | "glitch"
  | "story";

export type DirectorSourceAsset = {
  id: string;
  kind: "video" | "image";
  durationSeconds: number;
  width: number;
  height: number;
  fps?: number;
  /** Omit when the intake layer has not verified whether an audio stream exists. */
  hasAudio?: boolean;
};

export type DirectorEvidence = {
  sourceId: string;
  timestampSeconds: number;
  kind: "scene-change" | "motion" | "object" | "audio-beat" | "visual-quality";
  label: string;
  certainty: "observed" | "inferred" | "unknown";
  confidence: number;
};

export type DirectorClipPlan = {
  id: string;
  sourceId: string;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  speedFactor: number;
  transitionOutSeconds?: number;
  effects?: string[];
};

export type DirectorOutputSettings = {
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5" | "4:3";
  width: number;
  height: number;
  fps: number;
  includeOriginalAudio: boolean;
  includeMusic: boolean;
  includeBackgroundAudio: boolean;
};

export type DirectorMontagePlan = {
  contractVersion: typeof AI_DIRECTOR_CONTRACT_VERSION;
  id: string;
  style: DirectorStyle;
  clips: DirectorClipPlan[];
  output: DirectorOutputSettings;
  evidence?: DirectorEvidence[];
};

export type DirectorQualityReport = {
  momentSelection: number;
  pacing: number;
  transitions: number;
  musicSync: number;
  visualConsistency: number;
  technicalReliability: number;
};

export type ContractValidation = {
  valid: boolean;
  issues: string[];
};

const STYLES: readonly DirectorStyle[] = [
  "velocity",
  "cinematic",
  "anime",
  "glitch",
  "story",
];
const ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:5", "4:3"] as const;
const QUALITY_DIMENSIONS: readonly (keyof DirectorQualityReport)[] = [
  "momentSelection",
  "pacing",
  "transitions",
  "musicSync",
  "visualConsistency",
  "technicalReliability",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

export function validateDirectorQualityReport(input: unknown): ContractValidation {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return { valid: false, issues: ["Quality report must be an object."] };
  }

  for (const dimension of QUALITY_DIMENSIONS) {
    const score = input[dimension];
    if (!isFiniteNumber(score) || score < 0 || score > 100) {
      issues.push(`Quality score ${dimension} must be a finite number from 0 to 100.`);
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateDirectorMontagePlan(
  input: unknown,
  sources: readonly DirectorSourceAsset[],
): ContractValidation {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return { valid: false, issues: ["Montage plan must be an object."] };
  }

  if (input.contractVersion !== AI_DIRECTOR_CONTRACT_VERSION) {
    issues.push(`contractVersion must be ${AI_DIRECTOR_CONTRACT_VERSION}.`);
  }
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    issues.push("Plan id must be a non-empty string.");
  }
  if (typeof input.style !== "string" || !STYLES.includes(input.style as DirectorStyle)) {
    issues.push("Plan style is unsupported.");
  }
  if (!Array.isArray(input.clips) || input.clips.length === 0) {
    issues.push("Plan must contain at least one clip.");
  }
  if (!isRecord(input.output)) {
    issues.push("Output settings must be an object.");
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const clipIds = new Set<string>();

  if (Array.isArray(input.clips)) {
    input.clips.forEach((rawClip, index) => {
      const path = `clips[${index}]`;
      if (!isRecord(rawClip)) {
        issues.push(`${path} must be an object.`);
        return;
      }

      if (typeof rawClip.id !== "string" || rawClip.id.trim().length === 0) {
        issues.push(`${path}.id must be a non-empty string.`);
      } else if (clipIds.has(rawClip.id)) {
        issues.push(`${path}.id must be unique.`);
      } else {
        clipIds.add(rawClip.id);
      }

      const source = typeof rawClip.sourceId === "string"
        ? sourceById.get(rawClip.sourceId)
        : undefined;
      if (!source) {
        issues.push(`${path}.sourceId must reference a known source asset.`);
      }

      const start = rawClip.sourceStartSeconds;
      const end = rawClip.sourceEndSeconds;
      if (!isFiniteNumber(start) || start < 0) {
        issues.push(`${path}.sourceStartSeconds must be finite and non-negative.`);
      }
      if (!isFiniteNumber(end) || !isFiniteNumber(start) || end <= start) {
        issues.push(`${path}.sourceEndSeconds must be greater than sourceStartSeconds.`);
      }
      if (source && isFiniteNumber(end) && end > source.durationSeconds) {
        issues.push(`${path} exceeds source duration.`);
      }

      if (!isFiniteNumber(rawClip.speedFactor) || rawClip.speedFactor < 0.25 || rawClip.speedFactor > 4) {
        issues.push(`${path}.speedFactor must be between 0.25 and 4.`);
      }
      if (rawClip.transitionOutSeconds !== undefined) {
        const transition = rawClip.transitionOutSeconds;
        if (!isFiniteNumber(transition) || transition < 0 || transition > 2) {
          issues.push(`${path}.transitionOutSeconds must be between 0 and 2 seconds.`);
        } else if (isFiniteNumber(start) && isFiniteNumber(end)
          && isFiniteNumber(rawClip.speedFactor)
          && transition >= (end - start) / rawClip.speedFactor) {
          issues.push(`${path}.transitionOutSeconds must be shorter than the rendered clip.`);
        }
      }
      if (rawClip.effects !== undefined
        && (!Array.isArray(rawClip.effects)
          || rawClip.effects.some((effect) => typeof effect !== "string" || effect.trim().length === 0))) {
        issues.push(`${path}.effects must be an array of non-empty strings.`);
      }
    });
  }

  if (isRecord(input.output)) {
    const output = input.output;
    if (typeof output.aspectRatio !== "string"
      || !ASPECT_RATIOS.includes(output.aspectRatio as (typeof ASPECT_RATIOS)[number])) {
      issues.push("output.aspectRatio is unsupported.");
    }
    if (!isPositiveInteger(output.width)) issues.push("output.width must be a positive integer.");
    if (!isPositiveInteger(output.height)) issues.push("output.height must be a positive integer.");
    if (!isFiniteNumber(output.fps) || output.fps < 1 || output.fps > 120) {
      issues.push("output.fps must be between 1 and 120.");
    }
    for (const key of ["includeOriginalAudio", "includeMusic", "includeBackgroundAudio"] as const) {
      if (typeof output[key] !== "boolean") {
        issues.push(`output.${key} must be a boolean.`);
      }
    }
  }

  if (input.evidence !== undefined) {
    if (!Array.isArray(input.evidence)) {
      issues.push("evidence must be an array when provided.");
    } else {
      input.evidence.forEach((rawEvidence, index) => {
        const path = `evidence[${index}]`;
        if (!isRecord(rawEvidence)) {
          issues.push(`${path} must be an object.`);
          return;
        }
        if (typeof rawEvidence.sourceId !== "string" || !sourceById.has(rawEvidence.sourceId)) {
          issues.push(`${path}.sourceId must reference a known source asset.`);
        }
        if (!isFiniteNumber(rawEvidence.timestampSeconds) || rawEvidence.timestampSeconds < 0) {
          issues.push(`${path}.timestampSeconds must be finite and non-negative.`);
        }
        if (typeof rawEvidence.label !== "string" || rawEvidence.label.trim().length === 0) {
          issues.push(`${path}.label must be a non-empty string.`);
        }
        if (!isFiniteNumber(rawEvidence.confidence) || rawEvidence.confidence < 0 || rawEvidence.confidence > 1) {
          issues.push(`${path}.confidence must be between 0 and 1.`);
        }
        if (!["scene-change", "motion", "object", "audio-beat", "visual-quality"].includes(String(rawEvidence.kind))) {
          issues.push(`${path}.kind is unsupported.`);
        }
        if (!["observed", "inferred", "unknown"].includes(String(rawEvidence.certainty))) {
          issues.push(`${path}.certainty is unsupported.`);
        }
      });
    }
  }

  return { valid: issues.length === 0, issues };
}
