import type { HighlightMoment, HighlightSample } from "./highlight-finder";

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
  const previous = new Set(previousLabels);
  const current = new Set(currentLabels);
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
    if (bestIndex < 0) continue;
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

function chooseSampleIndices(count: number, limit: number, includeEdges = true): number[] {
  if (count <= limit) return Array.from({ length: count }, (_, index) => index);
  if (limit <= 1) return [Math.round((count - 1) / 2)];
  return Array.from({ length: limit }, (_, index) => includeEdges
    ? Math.round(index * (count - 1) / (limit - 1))
    : Math.round((index + 1) * (count - 1) / (limit + 1)));
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
  // Long clips need more than a start/end-adjacent pair to avoid missing a
  // meaningful middle scene, but keep the extra work tightly bounded on phones.
  return duration >= 30
    ? { maxFrames: 3, inferenceBudgetMs: 6_500, includeEdges: false }
    : { maxFrames: MAX_MODEL_FRAMES, inferenceBudgetMs: 10_000, includeEdges: true };
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
  const selectedIndices = chooseSampleIndices(candidates.length, frameBudget.maxFrames, frameBudget.includeEdges);
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
  const selectedStyle = allowCategoryStyleAdjustment
    ? suggestDirectorStyle(sceneInference.category, style)
    : style;
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
    const actionCues = [
      ...inferMotionCues(candidate.motion, candidate.contrast, previousLabels, labels, Math.max(0.015, referenceMotion)),
      ...(isModelSample ? inferTrackedObjectCues(previousObjects, objects) : [])
    ].filter((cue, cueIndex, allCues) => allCues.indexOf(cue) === cueIndex);
    const directorScore = scoreDirectorMoment(candidate, objects, selectedStyle, referenceMotion, novelty);
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
  const movementCues = [...new Set(indexed.flatMap((moment) => moment.actionCues))]
    .filter((cue) => cue !== "Стабильный кадр")
    .slice(0, 3);
  return {
    candidates: indexed,
    detectedLabels,
    modelLoaded: true,
    selectedStyle,
    note: detectedLabels.length
      ? `${duration >= 30 ? `Для длинного видео проверены ${selectedIndices.length} контрольных кадра. ` : ""}YOLOS обнаружил объекты: ${detectedLabels.slice(0, 6).join(", ")}. ${sceneInference.category !== "general" ? `Предварительная категория: ${getSceneCategoryLabel(sceneInference.category)} (по найденным объектам). ` : ""}${movementCues.length ? `Подсказки движения: ${movementCues.join(", ").toLowerCase()}. ` : ""}Фрагменты ранжированы под стиль «${selectedStyle}».`
      : `${duration >= 30 ? `Для длинного видео проверены ${selectedIndices.length} контрольных кадра. ` : ""}Модель загрузилась, но уверенных объектов не найдено. Ранжирование опирается на движение и контраст; тип сцены пока не определён.`
  };
}
