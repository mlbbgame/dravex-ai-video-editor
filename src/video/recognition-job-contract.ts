/**
 * Shared state-machine contract for future asynchronous media-analysis jobs.
 *
 * This is domain logic only; it does not provide authentication, storage,
 * queues, or network endpoints. The server must enforce ownership separately.
 */
export type RecognitionJobStatus =
  | "created"
  | "uploading"
  | "uploaded"
  | "probing"
  | "sampling"
  | "recognizing"
  | "planning"
  | "rendering-preview"
  | "ready"
  | "failed"
  | "cancelled";

export type RecognitionJobStage =
  | "upload"
  | "probe"
  | "sampling"
  | "recognition"
  | "planning"
  | "preview"
  | "complete";

export type RecognitionJobSnapshot = {
  jobId: string;
  mediaId: string;
  status: RecognitionJobStatus;
  progress: number;
  stage: RecognitionJobStage;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
};

const terminalStatuses = new Set<RecognitionJobStatus>(["ready", "failed", "cancelled"]);

const transitions: Record<RecognitionJobStatus, readonly RecognitionJobStatus[]> = {
  created: ["uploading", "cancelled", "failed"],
  uploading: ["uploaded", "cancelled", "failed"],
  uploaded: ["probing", "cancelled", "failed"],
  probing: ["sampling", "cancelled", "failed"],
  sampling: ["recognizing", "cancelled", "failed"],
  recognizing: ["planning", "cancelled", "failed"],
  planning: ["rendering-preview", "cancelled", "failed"],
  "rendering-preview": ["ready", "cancelled", "failed"],
  ready: [],
  failed: [],
  cancelled: [],
};

export type JobValidation = { valid: boolean; errors: string[] };

export function canTransitionJob(
  from: RecognitionJobStatus,
  to: RecognitionJobStatus,
): boolean {
  return transitions[from].includes(to);
}

export function isTerminalJobStatus(status: RecognitionJobStatus): boolean {
  return terminalStatuses.has(status);
}

export function validateRecognitionJobSnapshot(input: unknown): JobValidation {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { valid: false, errors: ["Job snapshot must be an object."] };
  }
  const value = input as Record<string, unknown>;
  const statuses = Object.keys(transitions);
  const stages: RecognitionJobStage[] = [
    "upload", "probe", "sampling", "recognition", "planning", "preview", "complete",
  ];

  if (typeof value.jobId !== "string" || !value.jobId.trim()) errors.push("Job ID is required.");
  if (typeof value.mediaId !== "string" || !value.mediaId.trim()) errors.push("Media ID is required.");
  if (typeof value.status !== "string" || !statuses.includes(value.status)) errors.push("Job status is unsupported.");
  if (typeof value.stage !== "string" || !stages.includes(value.stage)) errors.push("Job stage is unsupported.");
  if (typeof value.progress !== "number" || !Number.isFinite(value.progress) || value.progress < 0 || value.progress > 100) {
    errors.push("Job progress must be between 0 and 100.");
  }
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
    errors.push("Job createdAt must be a valid date string.");
  }
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    errors.push("Job updatedAt must be a valid date string.");
  }
  if (value.errorCode !== undefined && typeof value.errorCode !== "string") errors.push("Job errorCode must be a string.");
  if (value.errorMessage !== undefined && typeof value.errorMessage !== "string") errors.push("Job errorMessage must be a string.");
  if (value.retryable !== undefined && typeof value.retryable !== "boolean") errors.push("Job retryable must be boolean.");

  if (value.status === "ready" && value.progress !== 100) {
    errors.push("A ready job must report 100 percent progress.");
  }
  if (value.status === "failed" && (typeof value.errorCode !== "string" || !value.errorCode.trim())) {
    errors.push("A failed job must include a stable error code.");
  }
  if (value.status === "failed" && (typeof value.errorMessage !== "string" || !value.errorMessage.trim())) {
    errors.push("A failed job must include a user-safe error message.");
  }
  if (value.status === "ready" && value.stage !== "complete") {
    errors.push("A ready job must use the complete stage.");
  }

  return { valid: errors.length === 0, errors };
}
