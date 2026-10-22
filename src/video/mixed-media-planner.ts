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
  const scaledVideos = videoSegments.map((segment, index) => {
    const sourceSpan = Math.max(0, segment.trimEnd - segment.trimStart);
    const nextSpan = sourceSpan * scale;
    const center = (segment.trimStart + segment.trimEnd) / 2;
    const trimStart = Math.max(0, center - nextSpan / 2);
    return { ...segment, trimStart, trimEnd: trimStart + nextSpan };
  });
  const imageSegments: ImageSegment[] = images.map((image) => ({
    kind: "image",
    name: image.name,
    url: image.url,
    duration: imageSeconds,
  }));

  const result: SequenceSegment[] = [];
  let insertedImages = false;
  for (const item of order) {
    if (item.kind === "image") {
      result.push(imageSegments[images.findIndex((image) => image.url === item.url && image.name === item.name)]);
    } else if (!insertedImages) {
      // The video is a single source but may produce many analysed cuts.
      result.push(...scaledVideos);
      insertedImages = true;
    }
  }
  return result;
}
