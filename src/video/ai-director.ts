import type { HighlightMoment, HighlightSample } from "./highlight-finder";
import { buildDirectorEventTimeline, type DirectorEventEvidence } from "./director-event-timeline";
import { buildSmartEyeReport, type SmartEyeReport } from "./smart-eye";

export type DirectorStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story";

export type DetectedSceneCategory = "food" | "vehicles" | "people" | "animals" | "sports" | "indoor" | "nature" | "general";

export type SceneCategoryInference = {
  category: DetectedSceneCategory;
  confidence: number;
  matchedLabels: string[];
};

const SCENE_LABELS: Record<Exclude<DetectedSceneCategory, "general">, Set<string>> = {
  food: new Set(["apple", "banana", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake"]),
  vehicles: new Set(["bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat"]),
  people: new Set(["person"]),
  animals: new Set(["bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"]),
  sports: new Set(["sports ball", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "frisbee", "skis", "snowboard"]),
  indoor: new Set(["chair", "couch", "bed", "dining table", "tv", "laptop", "keyboard", "mouse", "cell phone", "book", "clock", "vase", "bottle", "cup", "bowl", "fork", "knife", "spoon", "refrigerator", "oven", "toaster", "sink"]),
  // YOLOS Tiny follows COCO labels and only detects potted plants, not landscapes.
  // Keep this category deliberately narrow rather than pretending it understands scenery.
  nature: new Set(["potted plant"])
};

const SCENE_CATEGORY_LABELS: Record<Exclude<DetectedSceneCategory, "general">, string> = {
  food: "еда",
  vehicles: "транспорт",
  people: "люди",
  animals: "животные",
  sports: "спорт",
  indoor: "предметы и интерьер",
  nature: "природа и растения"
};

export function getSceneCategoryLabel(category: DetectedSceneCategory): string | null {
  return category === "general" ? null : SCENE_CATEGORY_LABELS[category];
}

/**
 * Infer a broad subject category from object-detector labels only.
 * This is a lightweight editing hint, not full scene/action recognition:
 * landscape-only nature, emotions, recipes, and actions need a semantic vision model.
 */
export function inferSceneCategory(labels: string[]): SceneCategoryInference {
  const normalizedLabels = [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))];
  const ranked = (Object.entries(SCENE_LABELS) as Array<[Exclude<DetectedSceneCategory, "general">, Set<string>]>)
    .map(([category, known]) => ({
      category,
      matchedLabels: normalizedLabels.filter((label) => known.has(label))
    }))
    .filter((entry) => entry.matchedLabels.length > 0)
    .sort((a, b) => b.matchedLabels.length - a.matchedLabels.length);
  const best = ranked[0];
  if (!best) return { category: "general", confidence: 0, matchedLabels: [] };
  // Mixed scenes with equal support for different subjects are ambiguous. Do not
  // force an arbitrary category (and potentially the wrong editing style) on them.
  if (ranked[1] && ranked[1].matchedLabels.length === best.matchedLabels.length) {
    return { category: "general", confidence: 0, matchedLabels: [] };
  }
  // Confidence describes the consistency of detected labels with this simple taxonomy,
  // not a calibrated probability that the whole video belongs to this category.
  return {
    category: best.category,
    confidence: Math.min(0.9, 0.55 + (best.matchedLabels.length - 1) * 0.12),
    matchedLabels: best.matchedLabels
  };
}

/**
 * Change the automatic style only when multiple detector labels support the scene.
 * A single detected object is useful context, but too weak to override the user's fallback.
 */
export function chooseDirectorStyleFromInference(
  inference: SceneCategoryInference,
  fallback: DirectorStyle,
  allowAdjustment = true
): DirectorStyle {
  if (!allowAdjustment || inference.confidence < 0.67 || inference.category === "general") return fallback;
  return suggestDirectorStyle(inference.category, fallback);
}

/** Choose a conservative automatic edit profile from detected subjects. Manual styles remain untouched. */
export function suggestDirectorStyle(category: DetectedSceneCategory, fallback: DirectorStyle): DirectorStyle {
  switch (category) {
    case "vehicles":
    case "sports":
      return "velocity";
    case "people":
    case "indoor":
      return "story";
    case "food":
    case "animals":
    case "nature":
      return "cinematic";
    default:
      return fallback;
  }
}

export type DetectedObject = {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
};

export type DirectedMoment = HighlightMoment & {
  sceneLabels: string[];
  actionCues: string[];
  directorScore: number;
};

export type DirectorProgress = {
  current: number;
  total: number;
  phase: "loading-model" | "reading-frames" | "ranking";
};

export type AIDirectorResult = {
  candidates: DirectedMoment[];
  detectedLabels: string[];
  modelLoaded: boolean;
  selectedStyle: DirectorStyle;
  note: string;
  eventTimeline?: DirectorEventEvidence[];
  smartEye?: SmartEyeReport;
};

type ObjectDetector = (input: string) => Promise<DetectedObject[]>;
let detectorPromise: Promise<ObjectDetector> | null = null;

const MODEL_ID = "Xenova/yolos-tiny";
const MAX_MODEL_FRAMES = 4;
const MIN_OBJECT_CONFIDENCE = 0.35;

function getDetector(onProgress?: (progress: number) => void): Promise<ObjectDetector> {
  if (!detectorPromise) {
    detectorPromise = import("@huggingface/transformers").then(({ pipeline }) => pipeline("object-detection", MODEL_ID, {
      device: "wasm",
      dtype: "q8",
      progress_callback: (event: any) => {
        if (typeof event?.progress === "number") onProgress?.(Math.max(0, Math.min(100, event.progress)));
      }
    })).then((detector) => detector as unknown as ObjectDetector).catch((error: unknown) => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(time, video.duration - 0.06));
  if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.02) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Истёк тайм-аут чтения кадра."));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", ready);
      video.removeEventListener("error", failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Браузер не смог прочитать кадр.")); };
    video.addEventListener("seeked", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = target;
  });
}

function normalized(value: number, values: number[]): number {
  if (!values.length) return 0.5;
  const sorted = [...values].sort((a, b) => a - b);
  const low = sorted[Math.floor((sorted.length - 1) * 0.1)] ?? 0;
  const high = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 1;
  if (high - low < 0.0001) return 0.5;
  return Math.max(0, Math.min(1, (value - low) / (high - low)));
}

function normalizeSceneLabels(labels: readonly string[]): Set<string> {
  return new Set(labels
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean));
}

export function inferMotionCues(
  motion: number,
  contrast: number,
  previousLabels: string[] = [],
  currentLabels: string[] = [],
  motionReference = 0.08
): string[] {
  const cues: string[] = [];
  if (motion >= motionReference * 1.45) cues.push("Резкое движение");
  else if (motion <= motionReference * 0.48) cues.push("Стабильный кадр");
  else cues.push("Плавное движение");

  if (contrast >= 0.24) cues.push("Высокая визуальная выразительность");
  const previous = normalizeSceneLabels(previousLabels);
  const current = normalizeSceneLabels(currentLabels);
  if ([...current].some((label) => !previous.has(label)) && previous.size > 0) cues.push("Объект входит в сцену");
  if ([...previous].some((label) => !current.has(label)) && current.size > 0) cues.push("Смена объектов в сцене");
  return cues;
}

export function findNearestDetectedObjects(
  time: number,
  sampleTimes: number[],
  detections: DetectedObject[][],
  maxDistance: number
): DetectedObject[] {
  if (!Number.isFinite(time) || !Number.isFinite(maxDistance) || maxDistance < 0) return [];
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  sampleTimes.forEach((sampleTime, index) => {
    const distance = Math.abs(sampleTime - time);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex >= 0 && nearestDistance <= maxDistance
    ? detections[nearestIndex] ?? []
    : [];
}

export function inferTrackedObjectCues(previousObjects: DetectedObject[], currentObjects: DetectedObject[]): string[] {
  const cues: string[] = [];
  const matchedPrevious = new Set<number>();
  for (const current of currentObjects) {
    const currentCenterX = (current.box.xmin + current.box.xmax) / 2;
    const currentCenterY = (current.box.ymin + current.box.ymax) / 2;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    previousObjects.forEach((item, index) => {
      if (matchedPrevious.has(index) || item.label !== current.label) return;
      const centerX = (item.box.xmin + item.box.xmax) / 2;
      const centerY = (item.box.ymin + item.box.ymax) / 2;
      const distance = Math.hypot(currentCenterX - centerX, currentCenterY - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    // Do not associate same-class detections across a large jump: they may
    // belong to different people/vehicles in a cut or to unrelated objects.
    // Coordinates are evaluated against the detector's 320x180 analysis space.
    if (bestIndex < 0 || bestDistance > Math.hypot(320, 180) * 0.25) continue;
    matchedPrevious.add(bestIndex);
    const previous = previousObjects[bestIndex];
    const previousCenterX = (previous.box.xmin + previous.box.xmax) / 2;
    const previousCenterY = (previous.box.ymin + previous.box.ymax) / 2;
    const centerShift = Math.hypot(currentCenterX - previousCenterX, currentCenterY - previousCenterY) / Math.hypot(320, 180);
    const previousArea = Math.max(1, (previous.box.xmax - previous.box.xmin) * (previous.box.ymax - previous.box.ymin));
    const currentArea = Math.max(1, (current.box.xmax - current.box.xmin) * (current.box.ymax - current.box.ymin));
    if (centerShift >= 0.06) cues.push("Объект перемещается по кадру");
    if (currentArea / previousArea >= 1.3) cues.push("Объект приближается");
    else if (currentArea / previousArea <= 0.7) cues.push("Объект удаляется");
  }
  return [...new Set(cues)];
}

export function scoreDirectorMoment(
  moment: Pick<HighlightMoment, "score" | "motion" | "contrast">,
  objects: DetectedObject[],
  style: DirectorStyle,
  referenceMotion: number,
  novelty = 0
): number {
  const objectConfidence = objects.length
    ? objects.reduce((sum, item) => sum + item.score, 0) / objects.length
    : 0;
  const objectLabels = objects.map((item) => item.label.trim().toLowerCase());
  const objectPresence = Math.min(1, objects.length / 3) * objectConfidence;
  const subjectRelevance: Record<DirectorStyle, Set<string>> = {
    velocity: new Set(["car", "motorcycle", "bicycle", "bus", "train", "truck", "boat", "airplane", "sports ball", "skateboard", "surfboard", "person"]),
    anime: new Set(["person", "sports ball", "skateboard", "surfboard", "car", "motorcycle"]),
    cinematic: new Set(["person", "bird", "cat", "dog", "horse", "potted plant", "cake", "pizza", "sandwich", "apple", "orange"]),
    glitch: new Set(["car", "motorcycle", "bicycle", "sports ball", "skateboard", "surfboard", "person"]),
    story: new Set(["person", "bird", "cat", "dog", "horse", "potted plant", "cake", "pizza", "sandwich", "apple", "orange", "cup", "bowl"])
  };
  const relevantCount = objectLabels.filter((label) => subjectRelevance[style].has(label)).length;
  const relevance = objectLabels.length ? relevantCount / objectLabels.length : 0;
  // Object detections help most when they match the chosen editing language.
  const styleAwareObjectPresence = objectPresence * (0.65 + 0.35 * relevance);
  const motion = normalized(moment.motion, [0, referenceMotion, referenceMotion * 2, 1]);
  const contrast = Math.max(0, Math.min(1, moment.contrast / 0.35));
  const visual = Math.max(0, Math.min(1, moment.score));
  const change = Math.max(0, Math.min(1, novelty));

  const weights: Record<DirectorStyle, [number, number, number, number, number]> = {
    velocity: [0.26, 0.28, 0.12, 0.14, 0.20],
    anime: [0.22, 0.22, 0.24, 0.18, 0.14],
    cinematic: [0.34, 0.08, 0.20, 0.24, 0.14],
    glitch: [0.20, 0.26, 0.18, 0.12, 0.24],
    story: [0.36, 0.08, 0.20, 0.24, 0.12]
  };
  const [visualWeight, motionWeight, objectWeight, contrastWeight, changeWeight] = weights[style];
  const motionFit = style === "cinematic" || style === "story" ? 1 - motion : motion;
  return visual * visualWeight
    + motionFit * motionWeight
    + styleAwareObjectPresence * objectWeight
    + contrast * contrastWeight
    + change * changeWeight;
}

/**
 * Infer temporal editing cues from adjacent samples. These describe visual rhythm,
 * not verified semantic actions such as a goal, knockout, or completed cooking step.
 */
export function inferTemporalEventCues(
  previousMotion: number,
  currentMotion: number,
  nextMotion: number,
  previousLabels: string[] = [],
  currentLabels: string[] = [],
  nextLabels: string[] = [],
  motionReference = 0.08
): string[] {
  const cues: string[] = [];
  const values = [previousMotion, currentMotion, nextMotion];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return cues;

  const reference = Math.max(0.001, motionReference);
  if (
    currentMotion >= reference * 1.2 &&
    currentMotion >= previousMotion * 1.25 &&
    currentMotion >= nextMotion * 1.25
  ) {
    cues.push("Пик движения");
  } else if (
    currentMotion >= reference * 0.65 &&
    currentMotion >= previousMotion * 1.2 &&
    nextMotion >= currentMotion * 0.95
  ) {
    cues.push("Нарастание движения");
  } else if (
    previousMotion >= reference * 1.2 &&
    currentMotion <= previousMotion * 0.75 &&
    nextMotion <= currentMotion * 1.15
  ) {
    cues.push("Затухание движения");
  }

  const previous = normalizeSceneLabels(previousLabels);
  const current = normalizeSceneLabels(currentLabels);
  const next = normalizeSceneLabels(nextLabels);
  const overlapRatio = (left: Set<string>, right: Set<string>) => {
    if (!left.size || !right.size) return 1;
    const overlap = [...left].filter((label) => right.has(label)).length;
    return overlap / Math.max(left.size, right.size);
  };
  if (previous.size && current.size && overlapRatio(previous, current) < 0.25) {
    cues.push("Вероятная смена сцены");
  } else if (current.size && next.size && overlapRatio(current, next) < 0.25) {
    cues.push("Вероятная смена сцены");
  }
  return [...new Set(cues)];
}

/**
 * Turn timestamped evidence into a small, style-aware ranking bonus.
 * The event timeline is an editing signal, not proof of a named real-world action.
 */
export function getDirectorEventRankingBonus(
  events: DirectorEventEvidence[],
  time: number,
  style: DirectorStyle
): number {
  if (!Number.isFinite(time)) return 0;
  const actionFocused = style === "velocity" || style === "glitch";
  const narrative = style === "cinematic" || style === "story";
  let bonus = 0;
  for (const event of events) {
    if (Math.abs(event.sourceTime - time) > 0.65) continue;
    const confidence = Math.max(0, Math.min(1, event.confidence));
    switch (event.kind) {
      case "motion-peak": bonus += confidence * (actionFocused ? 0.075 : 0.025); break;
      case "motion-build-up": bonus += confidence * (actionFocused ? 0.04 : 0.02); break;
      case "motion-settling": bonus += confidence * (narrative ? 0.035 : 0.01); break;
      case "scene-change": bonus += confidence * (narrative ? 0.035 : 0.015); break;
      case "object-moving": bonus += confidence * (actionFocused ? 0.025 : 0.01); break;
      case "subject-approaching":
      case "subject-receding": bonus += confidence * (actionFocused ? 0.025 : 0.01); break;
      case "visual-highlight": bonus += confidence * 0.02; break;
    }
  }
  return Math.min(0.1, bonus);
}

function chooseSampleIndices(count: number, limit: number, includeEdges = true): number[] {
  if (count <= limit) return Array.from({ length: count }, (_, index) => index);
  if (limit <= 1) return [Math.round((count - 1) / 2)];
  return Array.from({ length: limit }, (_, index) => includeEdges
    ? Math.round(index * (count - 1) / (limit - 1))
    : Math.round((index + 1) * (count - 1) / (limit + 1)));
}

/**
 * Allocate the scarce object-detector budget to both source coverage and likely
 * highlights. The baseline anchors preserve temporal coverage; the remaining
 * slots prefer local motion/visual peaks while enforcing a minimum index gap.
 * Scores are only editing cues, not semantic proof of a particular action.
 */
export function chooseAdaptiveDirectorSampleIndices(
  candidates: Array<Pick<HighlightMoment, "score" | "motion" | "contrast">>,
  limit: number,
  includeEdges = true
): number[] {
  const count = candidates.length;
  if (!count || !Number.isFinite(limit) || limit <= 0) return [];
  const safeLimit = Math.max(1, Math.floor(limit));
  if (count <= safeLimit) return candidates.map((_, index) => index);
  if (safeLimit === 1) return [Math.round((count - 1) / 2)];

  const anchorCount = Math.max(1, Math.ceil(safeLimit / 2));
  const anchors = chooseSampleIndices(count, Math.min(anchorCount, safeLimit), includeEdges);
  const selected = new Set(anchors);
  const minimumGap = Math.max(1, Math.floor(count / (safeLimit * 2)));

  const quality = candidates.map((candidate, index) => {
    const previous = candidates[index - 1];
    const next = candidates[index + 1];
    const motion = Number.isFinite(candidate.motion) ? Math.max(0, candidate.motion) : 0;
    const visual = Number.isFinite(candidate.score) ? Math.max(0, Math.min(1, candidate.score)) : 0;
    const contrast = Number.isFinite(candidate.contrast) ? Math.max(0, Math.min(1, candidate.contrast / 0.35)) : 0;
    const previousMotion = previous && Number.isFinite(previous.motion) ? Math.max(0, previous.motion) : motion;
    const nextMotion = next && Number.isFinite(next.motion) ? Math.max(0, next.motion) : motion;
    const peak = Math.max(0, motion - Math.max(previousMotion, nextMotion));
    return { index, value: visual * 0.45 + contrast * 0.2 + Math.min(1, motion) * 0.2 + Math.min(1, peak * 4) * 0.15 };
  }).sort((a, b) => b.value - a.value || a.index - b.index);

  for (const candidate of quality) {
    if (selected.size >= safeLimit) break;
    if ([...selected].every((index) => Math.abs(index - candidate.index) >= minimumGap)) {
      selected.add(candidate.index);
    }
  }
  // If peaks were clustered, fill unused slots with the most evenly spaced
  // remaining indices so the middle and ending of the source stay represented.
  for (const index of chooseSampleIndices(count, safeLimit, includeEdges)) {
    if (selected.size >= safeLimit) break;
    selected.add(index);
  }
  return [...selected].sort((a, b) => a - b);
}

export type DirectorFrameBudget = {
  maxFrames: number;
  inferenceBudgetMs: number;
  includeEdges: boolean;
};

/** Bound local object detection on Android while still sampling long clips semantically. */
export function getDirectorFrameBudget(duration: number): DirectorFrameBudget {
  if (!Number.isFinite(duration) || duration <= 0) {
    return { maxFrames: 0, inferenceBudgetMs: 0, includeEdges: false };
  }
  // Scale semantic coverage with source length while keeping a hard mobile budget.
  // Five-minute clips need more interior samples than a 30-second clip, otherwise
  // the director can miss scene changes in the middle of the timeline.
  if (duration >= 180) return { maxFrames: 8, inferenceBudgetMs: 14_000, includeEdges: false };
  if (duration >= 60) return { maxFrames: 6, inferenceBudgetMs: 11_000, includeEdges: false };
  if (duration >= 30) return { maxFrames: 5, inferenceBudgetMs: 9_000, includeEdges: false };
  return { maxFrames: MAX_MODEL_FRAMES, inferenceBudgetMs: 10_000, includeEdges: true };
}

/**
 * AI Director uses a real, lazily downloaded YOLOS object-detection model, then
 * combines detections with temporal motion/contrast cues to rank shots for a style.
 * It does not claim to recognize specific human actions; those cues describe visible
 * motion and object changes. If model download/inference fails, the caller gets the
 * original visual candidates and can still export a video.
 */
export async function analyzeWithAIDirector(
  url: string,
  duration: number,
  samples: HighlightSample[],
  candidates: HighlightMoment[],
  style: DirectorStyle,
  onProgress?: (progress: DirectorProgress) => void,
  allowCategoryStyleAdjustment = false
): Promise<AIDirectorResult> {
  const emptyCandidates: DirectedMoment[] = candidates.map((candidate) => ({
    ...candidate,
    sceneLabels: [],
    actionCues: inferMotionCues(candidate.motion, candidate.contrast),
    directorScore: candidate.score
  }));
  if (!candidates.length || !samples.length || !Number.isFinite(duration) || duration < 0.25) {
    const note = !Number.isFinite(duration) || duration < 0.25
      ? "Не удалось определить корректную длительность видео. Использован резервный анализ движения и контраста."
      : "Недостаточно кадров для AI Director; используем базовый анализ движения.";
    return { candidates: emptyCandidates, detectedLabels: [], modelLoaded: false, selectedStyle: style, note };
  }

  let detector: ObjectDetector;
  const pendingDetector = getDetector((progress) => onProgress?.({ current: progress, total: 100, phase: "loading-model" }));
  let modelTimeout = 0;
  try {
    onProgress?.({ current: 0, total: 100, phase: "loading-model" });
    // The detector is an enhancement, never a hard dependency for export.
    // Avoid leaving a montage blocked indefinitely on a slow/offline model download.
    detector = await Promise.race([
      pendingDetector,
      new Promise<ObjectDetector>((_, reject) => {
        modelTimeout = window.setTimeout(
          () => reject(new Error("Истекло время загрузки модели AI Director.")),
          10_000
        );
      })
    ]);
  } catch {
    // A timeout only stops this analysis attempt; it does not cancel the underlying
    // download. Keep the in-flight promise so a later attempt can reuse it instead of
    // starting a second copy of the model download. Actual load failures clear the
    // shared promise inside getDetector().
    return {
      candidates: emptyCandidates,
      detectedLabels: [],
      modelLoaded: false,
      selectedStyle: style,
      note: "Модель объектов не загрузилась вовремя или недоступна офлайн. Использован резервный анализ движения и контраста."
    };
  } finally {
    window.clearTimeout(modelTimeout);
  }

  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = url;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d", { willReadFrequently: false });
  if (!context) {
    return { candidates: emptyCandidates, detectedLabels: [], modelLoaded: true, selectedStyle: style, note: "Canvas недоступен; использован резервный анализ." };
  }

  const frameBudget = getDirectorFrameBudget(duration);
  const selectedIndices = chooseAdaptiveDirectorSampleIndices(candidates, frameBudget.maxFrames, frameBudget.includeEdges);
  const detectionsByCandidate = new Map<number, DetectedObject[]>();
  const allLabels = new Set<string>();
  const inferenceStartedAt = performance.now();
  const inferenceBudgetMs = frameBudget.inferenceBudgetMs;
  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1 && Number.isFinite(video.duration)) return resolve();
      const timeout = window.setTimeout(() => reject(new Error("Не удалось открыть видео для детекции.")), 15000);
      video.addEventListener("loadedmetadata", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      video.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("Ошибка декодирования видео.")); }, { once: true });
      video.load();
    });

    for (let position = 0; position < selectedIndices.length; position += 1) {
      if (performance.now() - inferenceStartedAt >= inferenceBudgetMs) break;
      const index = selectedIndices[position];
      const candidate = candidates[index];
      let inferenceTimedOut = false;
      try {
        await seek(video, Math.min(candidate.time, Math.max(0, video.duration - 0.06)));
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        let inferenceTimeoutId = 0;
        const detected = await Promise.race([
          detector(canvas.toDataURL("image/jpeg", 0.78)),
          new Promise<DetectedObject[]>((_, reject) => {
            inferenceTimeoutId = window.setTimeout(() => {
              inferenceTimedOut = true;
              reject(new Error("Истёк бюджет распознавания кадра."));
            }, 2500);
          })
        ]).finally(() => window.clearTimeout(inferenceTimeoutId));
        const confident = detected.filter((item) => item.score >= MIN_OBJECT_CONFIDENCE).slice(0, 8);
        detectionsByCandidate.set(index, confident);
        confident.forEach((item) => allLabels.add(item.label));
      } catch {
        detectionsByCandidate.set(index, []);
        // A slow model must not queue more work or prevent the user from exporting.
        if (inferenceTimedOut) break;
      }
      onProgress?.({ current: position + 1, total: selectedIndices.length, phase: "reading-frames" });
      if (position % 2 === 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  } catch {
    return {
      candidates: emptyCandidates,
      detectedLabels: [...allLabels],
      modelLoaded: true,
      selectedStyle: style,
      note: "Модель загрузилась, но браузер не смог прочитать часть кадров. Сохраняем резервный анализ."
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  const motionValues = samples.map((sample) => sample.motion);
  const referenceMotion = motionValues.reduce((sum, value) => sum + value, 0) / Math.max(1, motionValues.length);
  const detectedLabels = [...allLabels].sort((a, b) => a.localeCompare(b, "ru"));
  const sceneInference = inferSceneCategory(detectedLabels);
  const selectedStyle = chooseDirectorStyleFromInference(sceneInference, style, allowCategoryStyleAdjustment);
  const sampledPosition = new Map(selectedIndices.map((candidateIndex, position) => [candidateIndex, position]));
  const sampleTimes = selectedIndices.map((candidateIndex) => candidates[candidateIndex].time);
  const sampledDetections = selectedIndices.map((candidateIndex) => detectionsByCandidate.get(candidateIndex) ?? []);
  const nearbyDetectionRadius = Math.max(1.25, duration / Math.max(2, selectedIndices.length * 2));
  const indexed = candidates.map((candidate, index) => {
    const isModelSample = sampledPosition.has(index);
    const objects = isModelSample
      ? detectionsByCandidate.get(index) ?? []
      : findNearestDetectedObjects(candidate.time, sampleTimes, sampledDetections, nearbyDetectionRadius);
    const position = sampledPosition.get(index) ?? -1;
    const previousIndex = isModelSample && position > 0 ? selectedIndices[position - 1] : -1;
    const previousObjects = previousIndex >= 0 ? detectionsByCandidate.get(previousIndex) ?? [] : [];
    const previousLabels = previousObjects.map((item) => item.label);
    const labels = [...new Set(objects.map((item) => item.label))];
    const novelty = isModelSample && previousLabels.length
      ? labels.filter((label) => !previousLabels.includes(label)).length / Math.max(1, new Set([...labels, ...previousLabels]).size)
      : 0;
    const sample = samples.reduce((best, item) => Math.abs(item.time - candidate.time) < Math.abs(best.time - candidate.time) ? item : best, samples[0]);
    const previousCandidate = candidates[index - 1];
    const nextCandidate = candidates[index + 1];
    const previousCandidateLabels = previousCandidate
      ? findNearestDetectedObjects(previousCandidate.time, sampleTimes, sampledDetections, nearbyDetectionRadius).map((item) => item.label)
      : previousLabels;
    const nextCandidateLabels = nextCandidate
      ? findNearestDetectedObjects(nextCandidate.time, sampleTimes, sampledDetections, nearbyDetectionRadius).map((item) => item.label)
      : labels;
    const temporalCues = previousCandidate && nextCandidate
      ? inferTemporalEventCues(
          previousCandidate.motion,
          candidate.motion,
          nextCandidate.motion,
          previousCandidateLabels,
          labels,
          nextCandidateLabels,
          Math.max(0.015, referenceMotion)
        )
      : [];
    const trackedTemporalCues = isModelSample
      ? inferTrackedObjectCues(previousObjects, objects)
      : [];
    const actionCues = [
      ...inferMotionCues(candidate.motion, candidate.contrast, previousLabels, labels, Math.max(0.015, referenceMotion)),
      ...trackedTemporalCues,
      ...temporalCues
    ].filter((cue, cueIndex, allCues) => allCues.indexOf(cue) === cueIndex);
    const directorScore = Math.min(1, scoreDirectorMoment(candidate, objects, selectedStyle, referenceMotion, novelty));
    return {
      ...candidate,
      score: directorScore,
      sceneLabels: labels,
      actionCues: sample.motion > referenceMotion * 1.45 && !actionCues.includes("Резкое движение")
        ? [...actionCues, "Движение выше среднего"]
        : actionCues,
      directorScore
    };
  });

  onProgress?.({ current: 1, total: 1, phase: "ranking" });
  // The timeline is now part of ranking, not merely a sidecar diagnostic.
  // Build from observed cues, apply small style-aware event bonuses, then rebuild
  // the timeline so returned confidence/labels reflect the final ranked candidates.
  const initialTimeline = buildDirectorEventTimeline(indexed, duration);
  const rankedCandidates = indexed.map((moment) => {
    const bonus = getDirectorEventRankingBonus(initialTimeline, moment.time, selectedStyle);
    const score = Math.min(1, moment.directorScore + bonus);
    return { ...moment, score, directorScore: score };
  });
  const eventTimeline = buildDirectorEventTimeline(rankedCandidates, duration);
  const movementCues = [...new Set(rankedCandidates.flatMap((moment) => moment.actionCues))]
    .filter((cue) => cue !== "Стабильный кадр")
    .slice(0, 3);
  return {
    candidates: rankedCandidates,
    eventTimeline,
    smartEye: buildSmartEyeReport({
      duration,
      detectedLabels,
      events: eventTimeline,
      observations: rankedCandidates.map((moment) => ({
        time: moment.time,
        sceneLabels: moment.sceneLabels,
        actionCues: moment.actionCues,
        score: moment.score,
      })),
      selectedStyle,
      sampledFrameCount: selectedIndices.length,
      candidateCount: candidates.length,
      sampledFrameTimes: selectedIndices.map((candidateIndex) => candidates[candidateIndex].time),
    }),
    detectedLabels,
    modelLoaded: true,
    selectedStyle,
    note: detectedLabels.length
      ? `${duration >= 30 ? `Для длинного видео проверены ${selectedIndices.length} контрольных кадра. ` : ""}YOLOS обнаружил объекты: ${detectedLabels.slice(0, 6).join(", ")}. ${sceneInference.category !== "general" ? `Предварительная категория: ${getSceneCategoryLabel(sceneInference.category)} (по найденным объектам). ` : ""}${movementCues.length ? `Подсказки движения: ${movementCues.join(", ").toLowerCase()}. ` : ""}Фрагменты ранжированы под стиль «${selectedStyle}».`
      : `${duration >= 30 ? `Для длинного видео проверены ${selectedIndices.length} контрольных кадра. ` : ""}Модель загрузилась, но уверенных объектов не найдено. Ранжирование опирается на движение и контраст; тип сцены пока не определён.`
  };
}
