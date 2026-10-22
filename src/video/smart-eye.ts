import type { DirectorEventEvidence } from "./director-event-timeline";
import type { DirectorStyle, DetectedSceneCategory } from "./ai-director";

export type SmartEyeCertainty = "observed" | "inferred" | "unknown";

export type SmartEyeMemoryEntry = {
  id: string;
  time: number | null;
  kind: "detected-object" | "frame-observation" | DirectorEventEvidence["kind"];
  label: string;
  confidence?: number;
  certainty: SmartEyeCertainty;
  evidence: string[];
};

export type SmartEyeReport = {
  version: 1;
  duration: number;
  selectedStyle: DirectorStyle;
  sceneCategory: DetectedSceneCategory;
  detectedEntities: string[];
  memory: SmartEyeMemoryEntry[];
  coverage: {
    candidateCount: number;
    sampledFrameCount: number;
    sampledFrameRatio: number;
    firstEventTime: number | null;
    lastEventTime: number | null;
    largestSampleGapSeconds: number;
  };
  limitations: string[];
};

export type SmartEyeFrameObservation = {
  time: number;
  sceneLabels: string[];
  actionCues: string[];
  score: number;
};

export type SmartEyeReportInput = {
  duration: number;
  detectedLabels: string[];
  events: DirectorEventEvidence[];
  observations?: SmartEyeFrameObservation[];
  selectedStyle: DirectorStyle;
  sampledFrameCount: number;
  candidateCount: number;
  /** Exact source timestamps passed through the object detector, not inferred candidate times. */
  sampledFrameTimes?: number[];
};

const ALLOWED_EVENT_KINDS = new Set(["visual-highlight", "motion-peak", "motion-build-up", "motion-settling", "scene-change", "object-moving", "subject-approaching", "subject-receding"]);
const MAX_LABEL_LENGTH = 120;

const LABEL_GROUPS: Record<Exclude<DetectedSceneCategory, "general">, Set<string>> = {
  food: new Set(["apple", "banana", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake"]),
  vehicles: new Set(["bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat"]),
  people: new Set(["person"]),
  animals: new Set(["bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"]),
  sports: new Set(["sports ball", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "frisbee", "skis", "snowboard"]),
  indoor: new Set(["chair", "couch", "bed", "dining table", "tv", "laptop", "keyboard", "mouse", "cell phone", "book", "clock", "vase", "bottle", "cup", "bowl", "fork", "knife", "spoon", "refrigerator", "oven", "toaster", "sink"]),
  nature: new Set(["potted plant"])
};

/**
 * Builds an in-analysis evidence ledger for the whole source timeline.
 * It preserves every supplied event and detected label; it does not claim
 * infinite, cross-session memory or semantic recognition the model did not perform.
 */
export function buildSmartEyeReport(input: SmartEyeReportInput): SmartEyeReport {
  const safeInput = input && typeof input === "object" ? input : {} as SmartEyeReportInput;
  const rawDuration = safeInput.duration;
  const duration = typeof rawDuration === "number" && Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0;
  const rawLabels = Array.isArray(safeInput.detectedLabels) ? safeInput.detectedLabels : [];
  const labels = [...new Set(rawLabels
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.trim().slice(0, MAX_LABEL_LENGTH).toLowerCase())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categoryEntries = (Object.entries(LABEL_GROUPS) as Array<[Exclude<DetectedSceneCategory, "general">, Set<string>]>)
    .map(([category, group]) => ({ category, count: labels.filter((label) => group.has(label)).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const category = categoryEntries.length > 0
    && (!categoryEntries[1] || categoryEntries[0].count > categoryEntries[1].count)
    ? categoryEntries[0].category
    : "general";

  const memory: SmartEyeMemoryEntry[] = [];
  const rawObservations = Array.isArray(safeInput.observations) ? safeInput.observations : [];
  const observations = rawObservations
    .filter((item) => item && typeof item === "object" && typeof item.time === "number" && Number.isFinite(item.time) && item.time >= 0 && item.time <= duration)
    .map((item) => ({
      ...item,
      sceneLabels: [...new Set((Array.isArray(item.sceneLabels) ? item.sceneLabels : [])
        .filter((label): label is string => typeof label === "string")
        .map((label) => label.trim().slice(0, MAX_LABEL_LENGTH).toLowerCase())
        .filter(Boolean))],
      actionCues: [...new Set((Array.isArray(item.actionCues) ? item.actionCues : [])
        .filter((cue): cue is string => typeof cue === "string")
        .map((cue) => cue.trim().slice(0, MAX_LABEL_LENGTH))
        .filter(Boolean))].slice(0, 12)
    }))
    .sort((a, b) => a.time - b.time);

  const timestampedLabels = new Set<string>();
  for (const observation of observations) {
    for (const label of observation.sceneLabels) {
      timestampedLabels.add(label);
      memory.push({
        id: "object:" + observation.time.toFixed(3) + ":" + label,
        time: observation.time,
        kind: "detected-object",
        label,
        certainty: "observed",
        evidence: ["Объектная метка в выбранном кадре"]
      });
    }
    if (observation.actionCues.length) {
      memory.push({
        id: "frame:" + observation.time.toFixed(3),
        time: observation.time,
        kind: "frame-observation",
        label: "Наблюдаемые признаки кадра",
        certainty: "observed",
        evidence: observation.actionCues
      });
    }
  }
  for (const label of labels.filter((item) => !timestampedLabels.has(item))) {
    memory.push({
      id: "object:" + label,
      time: null,
      kind: "detected-object",
      label,
      certainty: "observed",
      evidence: ["Объект обнаружен в анализе, но отдельная временная отметка недоступна"]
    });
  }
  const rawEvents = Array.isArray(safeInput.events) ? safeInput.events : [];
  for (const event of rawEvents) {
    if (!event || typeof event !== "object" || !ALLOWED_EVENT_KINDS.has(event.kind) || typeof event.sourceTime !== "number" || !Number.isFinite(event.sourceTime) || event.sourceTime < 0 || event.sourceTime > duration) continue;
    memory.push({
      id: `event:${event.kind}:${event.sourceTime.toFixed(3)}`,
      time: event.sourceTime,
      kind: event.kind,
      label: typeof event.label === "string" ? event.label.slice(0, 160) : "Неизвестное событие",
      confidence: typeof event.confidence === "number" && Number.isFinite(event.confidence) ? Math.max(0, Math.min(1, event.confidence)) : 0,
      certainty: "inferred",
      evidence: [...new Set((Array.isArray(event.evidence) ? event.evidence : []).filter((item) => typeof item === "string" && item.trim()).map((item) => item.slice(0, 160)))].slice(0, 12)
    });
  }
  memory.sort((a, b) => (a.time ?? Number.POSITIVE_INFINITY) - (b.time ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id));

  const candidateCount = typeof safeInput.candidateCount === "number" && Number.isFinite(safeInput.candidateCount) ? Math.max(0, Math.floor(safeInput.candidateCount)) : 0;
  const sampledFrameCount = typeof safeInput.sampledFrameCount === "number" && Number.isFinite(safeInput.sampledFrameCount)
    ? Math.max(0, Math.min(candidateCount, Math.floor(safeInput.sampledFrameCount)))
    : 0;
  // Coverage must count only events that are eligible for the evidence memory.
  // Otherwise malformed/unknown event kinds can make the report claim a later
  // event exists even though that event was correctly rejected from memory.
  const eventTimes = rawEvents
    .filter((event) => event && typeof event === "object"
      && ALLOWED_EVENT_KINDS.has(event.kind)
      && typeof event.sourceTime === "number"
      && Number.isFinite(event.sourceTime)
      && event.sourceTime >= 0
      && event.sourceTime <= duration)
    .map((event) => event.sourceTime)
    .sort((a, b) => a - b);
  // Report temporal blind spots explicitly. Include source boundaries so a set
  // of clustered interior observations cannot look like full-timeline coverage.
  // Candidate observations can include unsampled moments whose cues were inferred
  // from nearby frames. Coverage must use only timestamps actually sent to the model.
  const suppliedSampleTimes = (Array.isArray(safeInput.sampledFrameTimes) ? safeInput.sampledFrameTimes : [])
    .filter((time): time is number => typeof time === "number" && Number.isFinite(time) && time >= 0 && time <= duration);
  const observationTimes = [...new Set(suppliedSampleTimes)]
    .sort((a, b) => a - b);
  const coverageAnchors = [...new Set([0, ...observationTimes, duration])]
    .sort((a, b) => a - b);
  const largestSampleGapSeconds = coverageAnchors.reduce(
    (largest, time, index) => index === 0 ? largest : Math.max(largest, time - coverageAnchors[index - 1]),
    0,
  );

  return {
    version: 1,
    duration,
    selectedStyle: safeInput.selectedStyle && ["velocity", "anime", "cinematic", "glitch", "story"].includes(safeInput.selectedStyle) ? safeInput.selectedStyle : "cinematic",
    sceneCategory: category,
    detectedEntities: labels,
    memory,
    coverage: {
      candidateCount,
      sampledFrameCount,
      sampledFrameRatio: candidateCount ? sampledFrameCount / candidateCount : 0,
      firstEventTime: eventTimes.length ? eventTimes[0] : null,
      lastEventTime: eventTimes.length ? eventTimes[eventTimes.length - 1] : null,
      largestSampleGapSeconds
    },
    limitations: [
      "Это память доказательств только текущего анализа; постоянное обучение между запусками не включено.",
      "Кадры выборочные, поэтому событие между кадрами может быть пропущено.",
      "Объекты привязаны ко времени только там, где есть метки конкретного выбранного кадра; это не полноценное отслеживание идентичности объекта.",
      "Метки объектов не доказывают тип сцены, а эвристические события не являются подтверждённым распознаванием действий.",
      "YOLOS Tiny не распознаёт игровые события, рецепты, эмоции или конкретные манёвры автомобиля."
    ]
  };
}
