/**
 * Canonical, renderer-neutral timeline schema for DRAVEX.
 *
 * This validates edit intent before preview/export. It does not itself render
 * media or claim that every transition/effect is supported by the current
 * browser renderer. Keep this module pure so it can run in browser and worker.
 */

export type TimelineMediaKind = "video" | "image" | "audio";

export type TimelineSource = {
  id: string;
  kind: TimelineMediaKind;
  /** Required for video/audio; image sources are stills. */
  duration?: number;
};

export type TimelineClip = {
  id: string;
  sourceId: string;
  kind: "video" | "image";
  timelineStart: number;
  timelineEnd: number;
  /** Required for video, omitted for still images. */
  sourceRange?: { start: number; end: number };
  /** Constant playback rate for schema v1; speed ramps require a later schema. */
  playbackRate: number;
};

export type TimelineAudioTrack = {
  id: string;
  sourceId: string;
  timelineStart: number;
  timelineEnd: number;
  sourceRange: { start: number; end: number };
  gain: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  /** Current browser renderer loops music to cover the rendered visual duration. */
  loop: boolean;
};

export type EditTimeline = {
  schemaVersion: 1;
  targetDuration: number;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  resolution: "preview" | "720p" | "1080p" | "4K";
  frameRate: 24 | 25 | 30 | 50 | 60;
  clips: TimelineClip[];
  audioTracks: TimelineAudioTrack[];
};

export type TimelineValidation = { valid: boolean; errors: string[] };

const MAX_CLIPS = 240;
const MAX_AUDIO_TRACKS = 32;
const TIME_TOLERANCE_SECONDS = 0.05;
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;
const supportedRatios = new Set(["9:16", "16:9", "1:1", "4:5"]);
const supportedResolutions = new Set(["preview", "720p", "1080p", "4K"]);
const supportedFrameRates = new Set([24, 25, 30, 50, 60]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validRange(value: unknown): value is { start: number; end: number } {
  return isRecord(value)
    && isFiniteNumber(value.start)
    && isFiniteNumber(value.end)
    && value.start >= 0
    && value.end > value.start;
}

/**
 * Validate an untrusted timeline against media metadata measured by the intake
 * layer. Source durations must come from the actual media, not a user/model.
 */
export function validateEditTimeline(input: unknown, sources: readonly TimelineSource[]): TimelineValidation {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ["Timeline must be an object."] };

  if (!Array.isArray(sources)) return { valid: false, errors: ["Source metadata must be an array."] };
  const sourceById = new Map<string, TimelineSource>();
  sources.forEach((source, index) => {
    const rawSource: unknown = source;
    if (!isRecord(rawSource) || typeof rawSource.id !== "string" || !rawSource.id.trim()) {
      errors.push(`Source ${index + 1} must have a non-empty ID.`);
      return;
    }

    const sourceId = rawSource.id;
    const sourceKind = rawSource.kind;
    if (sourceKind !== "video" && sourceKind !== "image" && sourceKind !== "audio") {
      errors.push(`Source "${sourceId}" has an unsupported media kind.`);
      return;
    }
    const sourceDuration = rawSource.duration;
    if (sourceKind !== "image" && (!isFiniteNumber(sourceDuration) || sourceDuration <= 0)) {
      errors.push(`Source "${sourceId}" must have a finite positive duration.`);
    }
    if (sourceById.has(sourceId)) errors.push(`Source ID "${sourceId}" is duplicated.`);
    const normalizedSource: TimelineSource = {
      id: sourceId,
      kind: sourceKind,
      ...(isFiniteNumber(sourceDuration) ? { duration: sourceDuration } : {}),
    };
    sourceById.set(sourceId, normalizedSource);
  });

  if (input.schemaVersion !== 1) errors.push("Unsupported timeline schema version.");
  if (!isFiniteNumber(input.targetDuration) || input.targetDuration <= 0) {
    errors.push("Target duration must be a finite positive number.");
  }
  if (typeof input.aspectRatio !== "string" || !supportedRatios.has(input.aspectRatio)) {
    errors.push("Unsupported aspect ratio.");
  }
  if (typeof input.resolution !== "string" || !supportedResolutions.has(input.resolution)) {
    errors.push("Unsupported resolution.");
  }
  if (typeof input.frameRate !== "number" || !supportedFrameRates.has(input.frameRate)) {
    errors.push("Unsupported frame rate.");
  }

  if (!Array.isArray(input.clips) || input.clips.length === 0) {
    errors.push("At least one timeline clip is required.");
  } else if (input.clips.length > MAX_CLIPS) {
    errors.push(`Timeline cannot contain more than ${MAX_CLIPS} clips.`);
  }

  if (!Array.isArray(input.audioTracks)) {
    errors.push("Audio tracks must be an array.");
  } else if (input.audioTracks.length > MAX_AUDIO_TRACKS) {
    errors.push(`Timeline cannot contain more than ${MAX_AUDIO_TRACKS} audio tracks.`);
  }

  const ids = new Set<string>();
  let previousEnd = 0;
  let lastClipEnd: number | null = null;

  if (Array.isArray(input.clips)) {
    input.clips.forEach((rawClip, index) => {
      const prefix = `Clip ${index + 1}`;
      if (!isRecord(rawClip)) {
        errors.push(`${prefix} must be an object.`);
        return;
      }

      if (typeof rawClip.id !== "string" || !rawClip.id.trim()) {
        errors.push(`${prefix} ID is required.`);
      } else if (ids.has(rawClip.id)) {
        errors.push(`Timeline item ID "${rawClip.id}" is duplicated.`);
      } else {
        ids.add(rawClip.id);
      }

      if (typeof rawClip.sourceId !== "string" || !rawClip.sourceId.trim()) {
        errors.push(`${prefix} source ID is required.`);
      }
      const source = typeof rawClip.sourceId === "string" ? sourceById.get(rawClip.sourceId) : undefined;
      if (!source) errors.push(`${prefix} references an unknown source.`);
      else if (source.kind !== rawClip.kind) errors.push(`${prefix} media kind does not match its source.`);

      if (rawClip.kind !== "video" && rawClip.kind !== "image") {
        errors.push(`${prefix} kind must be video or image.`);
      }

      const start = rawClip.timelineStart;
      const end = rawClip.timelineEnd;
      if (!isFiniteNumber(start) || !isFiniteNumber(end) || start < 0 || end <= start) {
        errors.push(`${prefix} has invalid timeline timestamps.`);
      } else {
        if (index === 0 && start > TIME_TOLERANCE_SECONDS) {
          errors.push("Timeline must start at zero to avoid an unintended blank opening.");
        }
        if (index > 0 && Math.abs(start - previousEnd) > TIME_TOLERANCE_SECONDS) {
          errors.push(`${prefix} must begin where the previous clip ends; gaps and overlaps are not supported in schema v1.`);
        }
        previousEnd = end;
        lastClipEnd = end;
        if (isFiniteNumber(input.targetDuration) && end > input.targetDuration + TIME_TOLERANCE_SECONDS) {
          errors.push(`${prefix} extends beyond the target duration.`);
        }
      }

      if (rawClip.kind === "video") {
        if (!validRange(rawClip.sourceRange)) {
          errors.push(`${prefix} needs a valid source range.`);
        } else if (source && source.kind === "video" && isFiniteNumber(source.duration)
          && rawClip.sourceRange.end > source.duration + TIME_TOLERANCE_SECONDS) {
          errors.push(`${prefix} source range exceeds the source duration.`);
        }

        if (!isFiniteNumber(rawClip.playbackRate)
          || rawClip.playbackRate < MIN_PLAYBACK_RATE
          || rawClip.playbackRate > MAX_PLAYBACK_RATE) {
          errors.push(`${prefix} playback rate must be between ${MIN_PLAYBACK_RATE}x and ${MAX_PLAYBACK_RATE}x.`);
        } else if (validRange(rawClip.sourceRange) && isFiniteNumber(start) && isFiniteNumber(end)) {
          const expectedDuration = (rawClip.sourceRange.end - rawClip.sourceRange.start) / rawClip.playbackRate;
          if (Math.abs((end - start) - expectedDuration) > TIME_TOLERANCE_SECONDS) {
            errors.push(`${prefix} timeline duration does not match its source range and playback rate.`);
          }
        }
      } else if (rawClip.kind === "image") {
        if (rawClip.sourceRange !== undefined) errors.push(`${prefix} image must not declare a video source range.`);
        if (rawClip.playbackRate !== 1) errors.push(`${prefix} image playback rate must be 1.`);
      }
    });
  }

  if (isFiniteNumber(input.targetDuration) && lastClipEnd !== null
    && Math.abs(lastClipEnd - input.targetDuration) > TIME_TOLERANCE_SECONDS) {
    errors.push("Target duration must match the end of the final timeline clip.");
  }

  if (Array.isArray(input.audioTracks)) {
    input.audioTracks.forEach((rawTrack, index) => {
      const prefix = `Audio track ${index + 1}`;
      if (!isRecord(rawTrack)) {
        errors.push(`${prefix} must be an object.`);
        return;
      }

      if (typeof rawTrack.id !== "string" || !rawTrack.id.trim()) {
        errors.push(`${prefix} ID is required.`);
      } else if (ids.has(rawTrack.id)) {
        errors.push(`Timeline item ID "${rawTrack.id}" is duplicated.`);
      } else {
        ids.add(rawTrack.id);
      }

      if (typeof rawTrack.sourceId !== "string" || !rawTrack.sourceId.trim()) {
        errors.push(`${prefix} source ID is required.`);
      }
      const source = typeof rawTrack.sourceId === "string" ? sourceById.get(rawTrack.sourceId) : undefined;
      if (!source) errors.push(`${prefix} references an unknown source.`);
      else if (source.kind !== "audio") errors.push(`${prefix} source must be audio.`);

      const timelineStart = rawTrack.timelineStart;
      const timelineEnd = rawTrack.timelineEnd;
      if (!isFiniteNumber(timelineStart) || !isFiniteNumber(timelineEnd)
        || timelineStart < 0 || timelineEnd <= timelineStart) {
        errors.push(`${prefix} has invalid timeline timestamps.`);
      } else if (isFiniteNumber(input.targetDuration) && timelineEnd > input.targetDuration + TIME_TOLERANCE_SECONDS) {
        errors.push(`${prefix} extends beyond the target duration.`);
      }

      if (!validRange(rawTrack.sourceRange)) {
        errors.push(`${prefix} needs a valid source range.`);
      } else if (source && source.kind === "audio" && isFiniteNumber(source.duration)
        && rawTrack.sourceRange.end > source.duration + TIME_TOLERANCE_SECONDS) {
        errors.push(`${prefix} source range exceeds the source duration.`);
      }

      if (typeof rawTrack.loop !== "boolean") {
        errors.push(`${prefix} loop must be boolean.`);
      } else if (rawTrack.loop === false && isFiniteNumber(timelineStart) && isFiniteNumber(timelineEnd)
        && validRange(rawTrack.sourceRange)
        && Math.abs((timelineEnd - timelineStart) - (rawTrack.sourceRange.end - rawTrack.sourceRange.start)) > TIME_TOLERANCE_SECONDS) {
        errors.push(`${prefix} timeline duration must match its source range when looping is disabled.`);
      }

      if (!isFiniteNumber(rawTrack.gain) || rawTrack.gain < 0 || rawTrack.gain > 1) {
        errors.push(`${prefix} gain must be between 0 and 1.`);
      }
      if (!isFiniteNumber(rawTrack.fadeInSeconds) || rawTrack.fadeInSeconds < 0) {
        errors.push(`${prefix} fade-in must be non-negative.`);
      }
      if (!isFiniteNumber(rawTrack.fadeOutSeconds) || rawTrack.fadeOutSeconds < 0) {
        errors.push(`${prefix} fade-out must be non-negative.`);
      }
      if (isFiniteNumber(timelineStart) && isFiniteNumber(timelineEnd)
        && isFiniteNumber(rawTrack.fadeInSeconds) && isFiniteNumber(rawTrack.fadeOutSeconds)
        && rawTrack.fadeInSeconds + rawTrack.fadeOutSeconds > timelineEnd - timelineStart + TIME_TOLERANCE_SECONDS) {
        errors.push(`${prefix} fade-in and fade-out exceed the track duration.`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
