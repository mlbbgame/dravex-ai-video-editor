import type { ImageSegment, SequenceSegment, VideoSegment } from "./video-sequence-render";

export type MixedMediaOrderItem =
  | { kind: "image"; name: string; url: string }
  | { kind: "video"; name: string; url: string };

const MIN_IMAGE_SECONDS = 0.25;
const MIN_VIDEO_SECONDS = 0.5;
const MAX_IMAGE_SECONDS = 30;

/**
 * Places stills around the analysed cuts from one source video, preserving the
 * order in which the user selected media. Video trims are shortened around
 * their original centers to keep the requested total duration bounded.
 */
export function buildMixedMediaSequence(
  order: readonly MixedMediaOrderItem[],
  videoSegments: readonly VideoSegment[],
  targetDurationSeconds: number,
): SequenceSegment[] {
  const images = order.filter((item): item is Extract<MixedMediaOrderItem, { kind: "image" }> => item.kind === "image");
  const videos = order.filter((item): item is Extract<MixedMediaOrderItem, { kind: "video" }> => item.kind === "video");
  if (videos.length !== 1 || images.length === 0 || !videoSegments.length) return [];
  if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0) return [];

  const target = Math.max(1, targetDurationSeconds);
  const imageSeconds = Math.min(MAX_IMAGE_SECONDS, Math.max(MIN_IMAGE_SECONDS, Math.min(1.6, (target - MIN_VIDEO_SECONDS) / images.length)));
  const totalImageSeconds = imageSeconds * images.length;
  const videoBudget = target - totalImageSeconds;
  if (videoBudget < MIN_VIDEO_SECONDS) return [];

  const getSpeed = (segment: VideoSegment) =>
    Number.isFinite(segment.speedFactor) ? Math.max(0.25, Math.min(4, segment.speedFactor as number)) : 1;
  const durations = videoSegments.map((segment) =>
    Math.max(0, segment.trimEnd - segment.trimStart) / getSpeed(segment)
  );
  const totalVideoSeconds = durations.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalVideoSeconds) || totalVideoSeconds <= 0) return [];

  const scale = Math.min(1, videoBudget / totalVideoSeconds);
  const scaledVideos = videoSegments.map((segment) => {
    const sourceSpan = Math.max(0, segment.trimEnd - segment.trimStart);
    const nextSpan = sourceSpan * scale;
    const center = (segment.trimStart + segment.trimEnd) / 2;
    const trimStart = Math.max(segment.trimStart, center - nextSpan / 2);
    const trimEnd = Math.min(segment.trimEnd, trimStart + nextSpan);
    // Stabilize serialized timeline values and avoid floating-point-only regressions.
    return { ...segment, trimStart: Number(trimStart.toFixed(6)), trimEnd: Number(trimEnd.toFixed(6)) };
  });
  const imageSegments: ImageSegment[] = images.map((image) => ({
    kind: "image",
    name: image.name,
    url: image.url,
    duration: imageSeconds,
  }));

  const result: SequenceSegment[] = [];
  let insertedImages = false;
  let imageIndex = 0;
  for (const item of order) {
    if (item.kind === "image") {
      // Use the position in the selected list, not a URL/name lookup: users may
      // intentionally add the same photo more than once to control pacing.
      const imageSegment = imageSegments[imageIndex++];
      if (imageSegment) result.push(imageSegment);
    } else if (!insertedImages) {
      // The video is a single source but may produce many analysed cuts.
      result.push(...scaledVideos);
      insertedImages = true;
    }
  }
  return result;
}
