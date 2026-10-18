/**
 * Provider-neutral boundary for server-side semantic media recognition.
 *
 * This file defines the adapter contract only. Do not implement provider calls
 * in browser code or place API keys in Vite environment variables.
 */
import {
  validateMediaRecognition,
  type MediaKind,
  type MediaRecognitionResult,
  type RecognitionValidation,
} from "./media-recognition-contract";

export type ProbedMediaSource = {
  mediaId: string;
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  hasAudio: boolean;
};

export type RecognitionFrame = {
  timestamp: number;
  /** Short-lived, server-generated URL or an opaque storage key; never a public permanent URL. */
  assetReference: string;
};

export type RecognitionProviderRequest = {
  source: ProbedMediaSource;
  coarseFrames: RecognitionFrame[];
  denseFrames?: RecognitionFrame[];
  /** Optional private audio proxy reference for speech/music/beat analysis. */
  audioAssetReference?: string;
  language?: string;
};

export type RecognitionProvider = {
  readonly id: string;
  recognize(request: RecognitionProviderRequest): Promise<unknown>;
};

export type RecognitionPipelineResult =
  | { ok: true; providerId: string; result: MediaRecognitionResult }
  | { ok: false; providerId: string; validation: RecognitionValidation };

const MAX_FRAMES_PER_PASS = 240;
const MAX_MEDIA_BYTES = 2_000_000_000;

function validateRequest(request: RecognitionProviderRequest): string[] {
  const errors: string[] = [];
  const { source, coarseFrames, denseFrames = [] } = request;

  if (!source.mediaId.trim()) errors.push("Source media ID is required.");
  if (!Number.isFinite(source.duration) || source.duration <= 0) errors.push("Source duration must be positive.");
  if (!Number.isInteger(source.width) || source.width <= 0) errors.push("Source width must be a positive integer.");
  if (!Number.isInteger(source.height) || source.height <= 0) errors.push("Source height must be a positive integer.");
  if (!source.mimeType.trim()) errors.push("Source MIME type is required.");
  if (!Number.isSafeInteger(source.sizeBytes) || source.sizeBytes <= 0 || source.sizeBytes > MAX_MEDIA_BYTES) {
    errors.push("Source size must be a positive safe integer no larger than 2 GB.");
  }
  if (typeof source.hasAudio !== "boolean") errors.push("Source audio presence must be boolean.");
  if (coarseFrames.length === 0) errors.push("At least one coarse frame is required.");
  if (coarseFrames.length + denseFrames.length > MAX_FRAMES_PER_PASS) {
    errors.push("Total recognition frame count exceeds the 240-frame cap.");
  }

  [...coarseFrames, ...denseFrames].forEach((frame, index) => {
    if (!Number.isFinite(frame.timestamp) || frame.timestamp < 0 || frame.timestamp > source.duration) {
      errors.push(`Frame ${index + 1} timestamp is outside the source bounds.`);
    }
    if (!frame.assetReference.trim()) errors.push(`Frame ${index + 1} asset reference is required.`);
  });

  return errors;
}

/**
 * Calls an injected provider and validates its untrusted output before any
 * director or renderer may consume it. Intended for a server-side runtime.
 */
export async function runRecognitionPipeline(
  provider: RecognitionProvider,
  request: RecognitionProviderRequest,
): Promise<RecognitionPipelineResult> {
  const requestErrors = validateRequest(request);
  if (requestErrors.length > 0) {
    return {
      ok: false,
      providerId: provider.id,
      validation: { valid: false, errors: requestErrors },
    };
  }

  const raw = await provider.recognize(request);
  const validation = validateMediaRecognition(raw, {
    mediaId: request.source.mediaId,
    kind: request.source.kind,
    duration: request.source.duration,
  });

  if (!validation.valid) {
    return { ok: false, providerId: provider.id, validation };
  }

  return {
    ok: true,
    providerId: provider.id,
    result: raw as MediaRecognitionResult,
  };
}
