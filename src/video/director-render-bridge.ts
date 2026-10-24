import type { DirectorMontagePlan } from "./ai-director-contract";
import type { VideoSegment } from "./video-sequence-render";

/**
 * Bridge a validated Director plan into the browser renderer's native clip shape.
 * Planned source trims are preserved; the renderer remains responsible for fitting
 * an overlong sequence to the requested output duration.
 */
export function directorPlanToVideoSegments(
  plan: DirectorMontagePlan,
  sourceId: string,
  name: string,
  url: string,
): VideoSegment[] {
  if (!plan || !Array.isArray(plan.clips) || !sourceId || !url) return [];

  return plan.clips
    .filter((clip) =>
      clip.sourceId === sourceId &&
      Number.isFinite(clip.sourceStartSeconds) &&
      Number.isFinite(clip.sourceEndSeconds) &&
      Number.isFinite(clip.speedFactor) &&
      clip.speedFactor >= 0.25 && clip.speedFactor <= 4 &&
      (clip.transitionOutSeconds === undefined || (Number.isFinite(clip.transitionOutSeconds) && clip.transitionOutSeconds >= 0 && clip.transitionOutSeconds <= 2)) &&
      clip.sourceStartSeconds >= 0 &&
      clip.sourceEndSeconds > clip.sourceStartSeconds
    )
    .slice(0, 200)
    .map((clip) => ({
      name,
      url,
      trimStart: clip.sourceStartSeconds,
      trimEnd: clip.sourceEndSeconds,
      speedFactor: clip.speedFactor,
      transitionOutSeconds: clip.transitionOutSeconds,
      ...(Array.isArray(clip.effects) ? { effects: clip.effects.filter((effect) => ["flash", "glitch-slices", "speed-lines", "vignette", "light-leak", "chromatic-shift", "letterbox"].includes(effect)) } : {}),
    }));
}
