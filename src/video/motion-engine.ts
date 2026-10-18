export type MotionStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story";

type Keyframe = { at: number; rate: number };

const profiles: Record<MotionStyle, Keyframe[]> = {
  // A controlled speed-up, impact slow-down, then recovery. The curve is normalized
  // so the average playback rate remains 1x and a clip still fits its planned duration.
  velocity: [
    { at: 0, rate: 0.72 },
    { at: 0.16, rate: 0.92 },
    { at: 0.34, rate: 1.72 },
    { at: 0.48, rate: 0.58 },
    { at: 0.62, rate: 0.52 },
    { at: 0.8, rate: 1.52 },
    { at: 1, rate: 1.02 },
  ],
  anime: [
    { at: 0, rate: 0.78 },
    { at: 0.22, rate: 1.55 },
    { at: 0.38, rate: 0.55 },
    { at: 0.52, rate: 0.5 },
    { at: 0.74, rate: 1.45 },
    { at: 1, rate: 1.02 },
  ],
  cinematic: [
    { at: 0, rate: 0.82 },
    { at: 0.25, rate: 0.72 },
    { at: 0.5, rate: 0.68 },
    { at: 0.74, rate: 0.9 },
    { at: 1, rate: 1.18 },
  ],
  story: [
    { at: 0, rate: 0.88 },
    { at: 0.28, rate: 0.8 },
    { at: 0.58, rate: 0.82 },
    { at: 0.82, rate: 1.02 },
    { at: 1, rate: 1.12 },
  ],
  glitch: [
    { at: 0, rate: 0.78 },
    { at: 0.18, rate: 1.6 },
    { at: 0.34, rate: 0.58 },
    { at: 0.48, rate: 1.72 },
    { at: 0.68, rate: 0.62 },
    { at: 0.84, rate: 1.4 },
    { at: 1, rate: 1.02 },
  ],
};

function interpolateProfile(profile: Keyframe[], progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  for (let index = 1; index < profile.length; index += 1) {
    const right = profile[index];
    const left = profile[index - 1];
    if (t <= right.at) {
      const local = (t - left.at) / (right.at - left.at);
      // Smoothstep removes abrupt playback-rate changes between keyframes.
      const eased = local * local * (3 - 2 * local);
      return left.rate + (right.rate - left.rate) * eased;
    }
  }
  return profile[profile.length - 1].rate;
}

function profileMean(profile: Keyframe[]): number {
  let area = 0;
  for (let index = 1; index < profile.length; index += 1) {
    const left = profile[index - 1];
    const right = profile[index];
    area += (left.rate + right.rate) * 0.5 * (right.at - left.at);
  }
  return area;
}

/** A smooth, normalized speed curve; average speed stays close to 1x. */
export function getSpeedRampRate(style: MotionStyle, progress: number, cutIndex = 0): number {
  const profile = profiles[style];
  const t = cutIndex % 2 === 0 ? progress : 1 - progress;
  const normalized = interpolateProfile(profile, t) / profileMean(profile);
  return Math.max(0.45, Math.min(1.85, normalized));
}

/** Consistent canvas color treatment with strength kept restrained on phone footage. */
export function getColorGradeFilter(style: MotionStyle, strength: "soft" | "balanced" | "strong" = "balanced"): string {
  const scale = strength === "soft" ? 0.55 : strength === "strong" ? 1.25 : 1;
  const grades: Record<MotionStyle, { contrast: number; saturation: number; brightness: number; sepia: number }> = {
    velocity: { contrast: 1.1, saturation: 1.13, brightness: 1.015, sepia: 0 },
    anime: { contrast: 1.14, saturation: 1.22, brightness: 1.025, sepia: 0 },
    cinematic: { contrast: 1.08, saturation: 1.06, brightness: 0.99, sepia: 0.025 },
    glitch: { contrast: 1.16, saturation: 1.2, brightness: 1.01, sepia: 0 },
    story: { contrast: 1.025, saturation: 1.035, brightness: 1.015, sepia: 0.012 },
  };
  const grade = grades[style];
  const contrast = 1 + (grade.contrast - 1) * scale;
  const saturation = 1 + (grade.saturation - 1) * scale;
  const brightness = 1 + (grade.brightness - 1) * scale;
  const sepia = grade.sepia * scale;
  return `contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) sepia(${sepia.toFixed(3)})`;
}
