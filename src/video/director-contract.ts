/**
 * Provider-neutral contracts for the cloud-first DRAVEX AI Director.
 *
 * This module defines and validates plans; it does not call an AI model,
 * upload media, or render video. Keep it independent of any model vendor.
 */

export type DirectorProfileId = "aggressive-car" | "cinematic-travel" | "nature-wildlife" | "food-cooking" | "people-everyday" | "product-diy";
export type DirectorVariantId = "hype" | "cinematic" | "emotion" | "signature";
export type DirectorTransition = "cut" | "short-impact" | "smooth" | "match-motion";
export type DirectorEffect = "speed-ramp" | "motion-blur" | "flash" | "camera-motion" | "color-grade";
export type MusicSource = "licensed-library" | "user-upload";

export type DirectorSegment = {
  sourceStart: number;
  sourceEnd: number;
  eventLabels: string[];
  transitionIn: DirectorTransition;
  effects: DirectorEffect[];
  confidence: number;
};

export type DirectorMusicPlan = {
  source: MusicSource;
  trackId: string;
  sourceStart: number;
  sourceEnd: number;
  gain: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  beatConfidence: number;
};

export type DirectorEditPlan = {
  schemaVersion: 1;
  sourceId: string;
  profile: DirectorProfileId;
  variant: DirectorVariantId;
  targetDuration: number;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  resolution: "720p" | "1080p";
  frameRate: 24 | 25 | 30 | 50 | 60;
  segments: DirectorSegment[];
  music: DirectorMusicPlan;
};

export type DirectorProfile = {
  id: DirectorProfileId;
  title: string;
  summary: string;
  preferredMusic: string[];
  preferredTransitions: DirectorTransition[];
  preferredEffects: DirectorEffect[];
  eventPriorities: string[];
  pacing: "aggressive" | "measured";
};

export const directorProfiles: Record<DirectorProfileId, DirectorProfile> = {
  "aggressive-car": {
    id: "aggressive-car",
    title: "Aggressive Car Edit",
    summary: "Fast, impact-led car edits that emphasize action only when the source supports it.",
    preferredMusic: ["phonk", "bass", "aggressive-electronic"],
    preferredTransitions: ["cut", "short-impact", "match-motion"],
    preferredEffects: ["speed-ramp", "motion-blur", "flash"],
    eventPriorities: ["acceleration", "drift", "turn", "wheel-detail", "tire-smoke", "camera-angle-change"],
    pacing: "aggressive",
  },
  "cinematic-travel": {
    id: "cinematic-travel",
    title: "Cinematic / Travel",
    summary: "Atmospheric edits that prioritize expressive shots, coherent movement, and measured pacing.",
    preferredMusic: ["cinematic", "ambient", "melodic-electronic"],
    preferredTransitions: ["cut", "smooth", "match-motion"],
    preferredEffects: ["camera-motion", "color-grade"],
    eventPriorities: ["establishing-shot", "landscape", "travel-motion", "location-change", "expressive-detail"],
    pacing: "measured",
  },
  "nature-wildlife": {
    id: "nature-wildlife",
    title: "Nature & Wildlife",
    summary: "Calm, natural edits for landscapes, waterfalls, forests, clouds, birds, animals, and macro details.",
    preferredMusic: ["ambient", "nature-atmosphere", "gentle-cinematic"],
    preferredTransitions: ["cut", "smooth", "match-motion"],
    preferredEffects: ["camera-motion", "color-grade"],
    eventPriorities: ["landscape-establishing-shot", "waterfall-flow", "cloud-movement", "bird-flight", "animal-behavior", "macro-detail", "natural-light", "quiet-moment"],
    pacing: "measured",
  },
  "food-cooking": {
    id: "food-cooking",
    title: "Food & Cooking",
    summary: "Understand cooking as a sequence and connect preparation, cooking, serving, appetizing close-ups, and the finished dish.",
    preferredMusic: ["warm-acoustic", "light-groove", "upbeat-cooking"],
    preferredTransitions: ["cut", "smooth", "match-motion"],
    preferredEffects: ["camera-motion", "color-grade"],
    eventPriorities: ["ingredients-overview", "chopping", "mixing", "seasoning", "frying", "baking", "plating", "texture-close-up", "steam", "finished-dish"],
    pacing: "measured",
  },
  "people-everyday": {
    id: "people-everyday",
    title: "People, Pets & Everyday Life",
    summary: "Preserve faces, emotions, interactions, and meaningful moments with careful framing and restrained effects.",
    preferredMusic: ["warm-acoustic", "gentle-cinematic", "light-ambient"],
    preferredTransitions: ["cut", "smooth", "match-motion"],
    preferredEffects: ["color-grade"],
    eventPriorities: ["face-visible", "smile", "emotion-change", "eye-contact", "person-interaction", "pet-behavior", "family-moment", "important-action", "clean-ending"],
    pacing: "measured",
  },
  "product-diy": {
    id: "product-diy",
    title: "Products, Tutorials & DIY",
    summary: "Explain a process in order: overview, tools and materials, close-up details, each step, and the final result.",
    preferredMusic: ["light-electronic", "focused-ambient", "upbeat-tutorial"],
    preferredTransitions: ["cut", "smooth", "match-motion"],
    preferredEffects: ["camera-motion", "color-grade"],
    eventPriorities: ["finished-result-teaser", "overview-shot", "tools-materials", "detail-close-up", "step-start", "step-completion", "before-after", "final-result"],
    pacing: "measured",
  },
};

/**
 * Suggest a profile from already-detected semantic event labels.
 * This is routing logic only: it does not detect events from pixels itself.
 * Ties and empty/unknown labels fall back to cinematic/travel for a restrained edit.
 */
export function suggestDirectorProfile(eventLabels: readonly string[]): DirectorProfileId {
  const normalized = new Set(eventLabels.map((label) => label.trim().toLowerCase()).filter(Boolean));
  const candidates = (Object.values(directorProfiles) as DirectorProfile[]).map((profile) => ({
    id: profile.id,
    score: profile.eventPriorities.reduce((score, event) => score + (normalized.has(event.toLowerCase()) ? 1 : 0), 0),
  }));
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length || candidates[0].score === 0) return "cinematic-travel";
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return "cinematic-travel";
  return candidates[0].id;
}

export type DirectorSceneCandidate = {
  sourceStart: number;
  sourceEnd: number;
  eventLabels: string[];
  confidence: number;
};

export type DirectorGuidance = {
  profile: DirectorProfileId;
  title: string;
  pacing: "aggressive" | "measured";
  preferredMusic: string[];
  preferredTransitions: DirectorTransition[];
  preferredEffects: DirectorEffect[];
  eventPriorities: string[];
  preserveChronology: boolean;
  avoidFlashyEffects: boolean;
};

/**
 * Produce renderer/model guidance from a chosen or suggested profile.
 * This is an instruction package, not semantic video analysis or rendering.
 */
export function getDirectorGuidance(profileId: DirectorProfileId): DirectorGuidance {
  const profile = directorProfiles[profileId] ?? directorProfiles["cinematic-travel"];
  const processProfiles: DirectorProfileId[] = ["food-cooking", "product-diy"];
  return {
    profile: profile.id,
    title: profile.title,
    pacing: profile.pacing,
    preferredMusic: [...profile.preferredMusic],
    preferredTransitions: [...profile.preferredTransitions],
    preferredEffects: [...profile.preferredEffects],
    eventPriorities: [...profile.eventPriorities],
    preserveChronology: processProfiles.includes(profile.id),
    avoidFlashyEffects: profile.id !== "aggressive-car",
  };
}

/**
 * Rank already-detected scenes using category-specific labels and confidence.
 * Keep timestamps intact; food/tutorial process order is preserved by sorting
 * chronologically after ranking rather than pretending semantic stages are known.
 */
export function rankDirectorCandidates(
  profileId: DirectorProfileId,
  candidates: readonly DirectorSceneCandidate[],
  sourceDuration: number,
): DirectorSceneCandidate[] {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return [];
  const guidance = getDirectorGuidance(profileId);
  const priorities = new Map(guidance.eventPriorities.map((label, index) => [label.toLowerCase(), guidance.eventPriorities.length - index]));
  const valid = candidates.filter((candidate) =>
    Number.isFinite(candidate.sourceStart) &&
    Number.isFinite(candidate.sourceEnd) &&
    candidate.sourceStart >= 0 &&
    candidate.sourceEnd > candidate.sourceStart &&
    candidate.sourceEnd <= sourceDuration &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 1 &&
    Array.isArray(candidate.eventLabels) &&
    candidate.eventLabels.every((label) => typeof label === "string"),
  );
  const score = (candidate: DirectorSceneCandidate) =>
    candidate.confidence * 2 +
    candidate.eventLabels.reduce((sum, label) => sum + (priorities.get(label.toLowerCase()) ?? 0), 0);
  return [...valid].sort((a, b) => {
    if (guidance.preserveChronology) return a.sourceStart - b.sourceStart;
    return score(b) - score(a) || a.sourceStart - b.sourceStart;
  });
}

export type DirectorPlanValidation = {
  valid: boolean;
  errors: string[];
};

const transitions = new Set<DirectorTransition>(["cut", "short-impact", "smooth", "match-motion"]);
const effects = new Set<DirectorEffect>(["speed-ramp", "motion-blur", "flash", "camera-motion", "color-grade"]);
const profiles = new Set<DirectorProfileId>(Object.keys(directorProfiles) as DirectorProfileId[]);
const variants = new Set<DirectorVariantId>(["hype", "cinematic", "emotion", "signature"]);
const musicSources = new Set<MusicSource>(["licensed-library", "user-upload"]);
const aspectRatios = new Set<DirectorEditPlan["aspectRatio"]>(["9:16", "16:9", "1:1", "4:5"]);
const resolutions = new Set<DirectorEditPlan["resolution"]>(["720p", "1080p"]);
const frameRates = new Set<DirectorEditPlan["frameRate"]>([24, 25, 30, 50, 60]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate untrusted model/API output before it reaches a renderer.
 * The source duration must come from trusted media probing, not model output.
 */
export function validateDirectorPlan(input: unknown, sourceDuration: number): DirectorPlanValidation {
  const errors: string[] = [];
  if (!isFiniteNumber(sourceDuration) || sourceDuration <= 0) {
    return { valid: false, errors: ["Source duration must be a finite positive number."] };
  }
  if (!isRecord(input)) return { valid: false, errors: ["Plan must be an object."] };

  if (input.schemaVersion !== 1) errors.push("Unsupported plan schema version.");
  if (typeof input.sourceId !== "string" || !input.sourceId.trim()) errors.push("Source ID is required.");
  if (typeof input.profile !== "string" || !profiles.has(input.profile as DirectorProfileId)) errors.push("Unknown director profile.");
  if (typeof input.variant !== "string" || !variants.has(input.variant as DirectorVariantId)) errors.push("Unknown variant.");
  if (!isFiniteNumber(input.targetDuration) || input.targetDuration <= 0) {
    errors.push("Target duration must be a finite positive number.");
  } else if (input.targetDuration > sourceDuration) {
    errors.push("Target duration cannot exceed source duration in this initial contract.");
  }
  if (typeof input.aspectRatio !== "string" || !aspectRatios.has(input.aspectRatio as DirectorEditPlan["aspectRatio"])) errors.push("Unsupported aspect ratio.");
  if (typeof input.resolution !== "string" || !resolutions.has(input.resolution as DirectorEditPlan["resolution"])) errors.push("Unsupported resolution.");
  if (typeof input.frameRate !== "number" || !frameRates.has(input.frameRate as DirectorEditPlan["frameRate"])) errors.push("Unsupported frame rate.");

  if (!Array.isArray(input.segments) || input.segments.length === 0) {
    errors.push("At least one segment is required.");
  } else {
    input.segments.forEach((rawSegment, index) => {
      const prefix = `Segment ${index + 1}`;
      if (!isRecord(rawSegment)) {
        errors.push(`${prefix} must be an object.`);
        return;
      }
      const start = rawSegment.sourceStart;
      const end = rawSegment.sourceEnd;
      if (!isFiniteNumber(start) || !isFiniteNumber(end) || start < 0 || end <= start || end > sourceDuration) {
        errors.push(`${prefix} has invalid source timestamps.`);
      }
      if (!Array.isArray(rawSegment.eventLabels) || rawSegment.eventLabels.some((label) => typeof label !== "string")) {
        errors.push(`${prefix} event labels must be strings.`);
      }
      if (typeof rawSegment.transitionIn !== "string" || !transitions.has(rawSegment.transitionIn as DirectorTransition)) {
        errors.push(`${prefix} uses an unsupported transition.`);
      }
      if (!Array.isArray(rawSegment.effects) || rawSegment.effects.some((effect) => typeof effect !== "string" || !effects.has(effect as DirectorEffect))) {
        errors.push(`${prefix} contains an unsupported effect.`);
      }
      if (!isFiniteNumber(rawSegment.confidence) || rawSegment.confidence < 0 || rawSegment.confidence > 1) {
        errors.push(`${prefix} confidence must be between 0 and 1.`);
      }
    });
  }

  if (!isRecord(input.music)) {
    errors.push("Music plan is required.");
  } else {
    const music = input.music;
    if (typeof music.source !== "string" || !musicSources.has(music.source as MusicSource)) errors.push("Unsupported music source.");
    if (typeof music.trackId !== "string" || !music.trackId.trim()) errors.push("Music track ID is required.");
    if (!isFiniteNumber(music.sourceStart) || !isFiniteNumber(music.sourceEnd) || music.sourceStart < 0 || music.sourceEnd <= music.sourceStart) {
      errors.push("Music source timestamps are invalid.");
    }
    if (!isFiniteNumber(music.gain) || music.gain < 0 || music.gain > 1) errors.push("Music gain must be between 0 and 1.");
    if (!isFiniteNumber(music.fadeInSeconds) || music.fadeInSeconds < 0) errors.push("Music fade-in must be non-negative.");
    if (!isFiniteNumber(music.fadeOutSeconds) || music.fadeOutSeconds < 0) errors.push("Music fade-out must be non-negative.");
    if (!isFiniteNumber(music.beatConfidence) || music.beatConfidence < 0 || music.beatConfidence > 1) {
      errors.push("Beat confidence must be between 0 and 1.");
    }
  }

  return { valid: errors.length === 0, errors };
}
