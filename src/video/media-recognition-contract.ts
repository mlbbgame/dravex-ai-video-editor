/**
 * Structured contract for semantic media understanding in DRAVEX.
 *
 * This is the boundary between a future cloud vision/video model and the
 * director planner. It validates model output; it does not itself recognize
 * scenes or call a provider.
 */

export type MediaKind = "image" | "video";

export type RecognitionLabel = {
  label: string;
  confidence: number;
  category: "subject" | "scene" | "action" | "composition" | "quality" | "mood";
};

export type RecognizedMoment = {
  start: number;
  end: number;
  summary: string;
  labels: RecognitionLabel[];
  motion: "static" | "low" | "medium" | "high" | "unknown";
  editingValue: "hero-shot" | "detail" | "transition" | "action-peak" | "atmosphere" | "avoid";
  confidence: number;
};

export type MediaRecognitionResult = {
  schemaVersion: 1;
  mediaId: string;
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  summary: string;
  labels: RecognitionLabel[];
  moments: RecognizedMoment[];
  audio: {
    present: boolean;
    speechLikely: boolean;
    musicLikely: boolean;
    beatConfidence: number;
  };
  warnings: string[];
};

export type RecognitionValidation = {
  valid: boolean;
  errors: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isConfidence(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

const kinds = new Set<MediaKind>(["image", "video"]);
const categories = new Set<RecognitionLabel["category"]>([
  "subject", "scene", "action", "composition", "quality", "mood",
]);
const motions = new Set<RecognizedMoment["motion"]>(["static", "low", "medium", "high", "unknown"]);
const editingValues = new Set<RecognizedMoment["editingValue"]>([
  "hero-shot", "detail", "transition", "action-peak", "atmosphere", "avoid",
]);

/** Validate untrusted model output before it is used to select frames or build an edit. */
export function validateMediaRecognition(
  input: unknown,
  expected: { mediaId: string; kind: MediaKind; duration: number },
): RecognitionValidation {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ["Recognition result must be an object."] };

  if (input.schemaVersion !== 1) errors.push("Unsupported recognition schema version.");
  if (input.mediaId !== expected.mediaId) errors.push("Recognition media ID does not match the requested source.");
  if (input.kind !== expected.kind || !kinds.has(input.kind as MediaKind)) errors.push("Recognition media kind does not match the source.");
  if (!finite(input.duration) || input.duration <= 0) errors.push("Recognition duration must be positive.");
  else if (Math.abs(input.duration - expected.duration) > Math.max(0.5, expected.duration * 0.01)) {
    errors.push("Recognition duration differs from the probed source duration.");
  }
  if (!finite(input.width) || input.width <= 0 || !Number.isInteger(input.width)) errors.push("Width must be a positive integer.");
  if (!finite(input.height) || input.height <= 0 || !Number.isInteger(input.height)) errors.push("Height must be a positive integer.");
  if (typeof input.summary !== "string" || !input.summary.trim()) errors.push("Recognition summary is required.");
  if (!Array.isArray(input.labels)) errors.push("Recognition labels must be an array.");
  if (!Array.isArray(input.moments)) errors.push("Recognition moments must be an array.");

  const validateLabels = (labels: unknown, path: string) => {
    if (!Array.isArray(labels)) {
      errors.push(`${path} must be an array.`);
      return;
    }
    labels.forEach((label, index) => {
      if (!isRecord(label)) {
        errors.push(`${path} item ${index + 1} must be an object.`);
        return;
      }
      if (typeof label.label !== "string" || !label.label.trim()) errors.push(`${path} item ${index + 1} has no label.`);
      if (typeof label.category !== "string" || !categories.has(label.category as RecognitionLabel["category"])) {
        errors.push(`${path} item ${index + 1} has an unsupported category.`);
      }
      if (!isConfidence(label.confidence)) errors.push(`${path} item ${index + 1} confidence must be between 0 and 1.`);
    });
  };

  if (Array.isArray(input.labels)) validateLabels(input.labels, "Recognition labels");

  if (Array.isArray(input.moments)) {
    input.moments.forEach((moment, index) => {
      const path = `Moment ${index + 1}`;
      if (!isRecord(moment)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      if (!finite(moment.start) || !finite(moment.end) || moment.start < 0 || moment.end <= moment.start || moment.end > expected.duration) {
        errors.push(`${path} has timestamps outside the source bounds.`);
      }
      if (typeof moment.summary !== "string" || !moment.summary.trim()) errors.push(`${path} summary is required.`);
      if (!isConfidence(moment.confidence)) errors.push(`${path} confidence must be between 0 and 1.`);
      if (typeof moment.motion !== "string" || !motions.has(moment.motion as RecognizedMoment["motion"])) {
        errors.push(`${path} has an unsupported motion label.`);
      }
      if (typeof moment.editingValue !== "string" || !editingValues.has(moment.editingValue as RecognizedMoment["editingValue"])) {
        errors.push(`${path} has an unsupported editing value.`);
      }
      validateLabels(moment.labels, `${path} labels`);
    });
  }

  if (!isRecord(input.audio)) {
    errors.push("Audio analysis is required.");
  } else {
    if (typeof input.audio.present !== "boolean") errors.push("Audio presence must be boolean.");
    if (typeof input.audio.speechLikely !== "boolean") errors.push("Speech likelihood must be boolean.");
    if (typeof input.audio.musicLikely !== "boolean") errors.push("Music likelihood must be boolean.");
    if (!isConfidence(input.audio.beatConfidence)) errors.push("Beat confidence must be between 0 and 1.");
  }
  if (!Array.isArray(input.warnings) || !input.warnings.every((warning) => typeof warning === "string")) {
    errors.push("Warnings must be an array of strings.");
  }

  return { valid: errors.length === 0, errors };
}
