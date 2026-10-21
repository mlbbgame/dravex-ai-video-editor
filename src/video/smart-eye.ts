import type { DirectorEventEvidence } from "./director-event-timeline";
import type { DirectorStyle, DetectedSceneCategory } from "./ai-director";

export type SmartEyeCertainty = "observed" | "inferred" | "unknown";

export type SmartEyeMemoryEntry = {
  id: string;
  time: number;
  kind: "detected-object" | DirectorEventEvidence["kind"];
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
  };
  limitations: string[];
};

export type SmartEyeReportInput = {
  duration: number;
  detectedLabels: string[];
  events: DirectorEventEvidence[];
  selectedStyle: DirectorStyle;
  sampledFrameCount: number;
  candidateCount: number;
};

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
  const duration = Number.isFinite(input.duration) ? Math.max(0, input.duration) : 0;
  const labels = [...new Set(input.detectedLabels
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.trim().toLowerCase())
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
  for (const label of labels) {
    memory.push({
      id: `object:${label}`,
      time: 0,
      kind: "detected-object",
      label,
      certainty: "observed",
      evidence: ["Объектная метка из модели детекции; время появления конкретного объекта не отслеживалось отдельно"]
    });
  }
  for (const event of input.events) {
    if (!Number.isFinite(event.sourceTime) || event.sourceTime < 0 || event.sourceTime > duration) continue;
    memory.push({
      id: `event:${event.kind}:${event.sourceTime.toFixed(3)}`,
      time: event.sourceTime,
      kind: event.kind,
      label: event.label,
      confidence: Number.isFinite(event.confidence) ? Math.max(0, Math.min(1, event.confidence)) : 0,
      certainty: "inferred",
      evidence: [...new Set(event.evidence.filter((item) => typeof item === "string" && item.trim()))]
    });
  }
  memory.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));

  const candidateCount = Number.isFinite(input.candidateCount) ? Math.max(0, Math.floor(input.candidateCount)) : 0;
  const sampledFrameCount = Number.isFinite(input.sampledFrameCount)
    ? Math.max(0, Math.min(candidateCount, Math.floor(input.sampledFrameCount)))
    : 0;
  const eventTimes = input.events
    .map((event) => event.sourceTime)
    .filter((time) => Number.isFinite(time) && time >= 0 && time <= duration)
    .sort((a, b) => a - b);

  return {
    version: 1,
    duration,
    selectedStyle: input.selectedStyle,
    sceneCategory: category,
    detectedEntities: labels,
    memory,
    coverage: {
      candidateCount,
      sampledFrameCount,
      sampledFrameRatio: candidateCount ? sampledFrameCount / candidateCount : 0,
      firstEventTime: eventTimes.length ? eventTimes[0] : null,
      lastEventTime: eventTimes.length ? eventTimes[eventTimes.length - 1] : null
    },
    limitations: [
      "Это память доказательств только текущего анализа; постоянное обучение между запусками не включено.",
      "Кадры выборочные, поэтому событие между кадрами может быть пропущено.",
      "Метки объектов не доказывают тип сцены, а эвристические события не являются подтверждённым распознаванием действий.",
      "YOLOS Tiny не распознаёт игровые события, рецепты, эмоции или конкретные манёвры автомобиля."
    ]
  };
}
