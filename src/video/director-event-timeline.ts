import type { HighlightMoment } from "./highlight-finder";

export type DirectorEventKind =
  | "visual-highlight"
  | "motion-peak"
  | "motion-build-up"
  | "motion-settling"
  | "scene-change"
  | "object-moving"
  | "subject-approaching"
  | "subject-receding";

export type DirectorEventEvidence = {
  kind: DirectorEventKind;
  label: string;
  confidence: number;
  sourceTime: number;
  start: number;
  end: number;
  evidence: string[];
};

export type DirectorEventCandidate = Pick<
  HighlightMoment,
  "time" | "start" | "end" | "score" | "motion" | "contrast"
> & {
  actionCues?: string[];
  sceneLabels?: string[];
};

/**
 * Convert low-level visual cues into a timestamped event timeline.
 * Confidence is a deterministic evidence-strength heuristic, not a calibrated
 * probability and not proof of a semantic action such as a goal or a drift.
 */
export function buildDirectorEventTimeline(
  candidates: DirectorEventCandidate[],
  duration: number,
  mergeWindowSeconds = 0.65
): DirectorEventEvidence[] {
  if (!Number.isFinite(duration) || duration <= 0 || !candidates.length) return [];
  const mergeWindow = Number.isFinite(mergeWindowSeconds)
    ? Math.max(0, mergeWindowSeconds)
    : 0.65;
  const events: DirectorEventEvidence[] = [];

  const clampTime = (value: number) => Math.max(0, Math.min(duration, value));
  const add = (
    candidate: DirectorEventCandidate,
    kind: DirectorEventKind,
    label: string,
    evidence: string[],
    baseConfidence: number
  ) => {
    if (![candidate.time, candidate.start, candidate.end].every(Number.isFinite)) return;
    const sourceTime = clampTime(candidate.time);
    const start = clampTime(Math.min(candidate.start, candidate.end));
    const end = clampTime(Math.max(candidate.start, candidate.end));
    const quality = Number.isFinite(candidate.score) ? Math.max(0, Math.min(1, candidate.score)) : 0;
    const confidence = Math.max(0.05, Math.min(0.95, baseConfidence * 0.65 + quality * 0.25
      + (evidence.length > 1 ? 0.05 : 0)));
    events.push({ kind, label, confidence, sourceTime, start, end, evidence: [...new Set(evidence)] });
  };

  for (const candidate of candidates) {
    const cues = [...new Set((candidate.actionCues ?? []).filter((cue) => typeof cue === "string"))];
    if (Number.isFinite(candidate.score) && candidate.score >= 0.72) {
      add(candidate, "visual-highlight", "Выразительный визуальный момент", ["Высокая визуальная оценка"], 0.72);
    }
    if (cues.includes("Пик движения")) {
      add(candidate, "motion-peak", "Пик движения", ["Пик движения"], 0.86);
    }
    if (cues.includes("Нарастание движения")) {
      add(candidate, "motion-build-up", "Нарастание движения", ["Нарастание движения"], 0.74);
    }
    if (cues.includes("Затухание движения")) {
      add(candidate, "motion-settling", "Затухание движения", ["Затухание движения"], 0.72);
    }
    if (cues.includes("Вероятная смена сцены")) {
      add(candidate, "scene-change", "Вероятная смена сцены", ["Изменение набора видимых объектов"], 0.66);
    }
    if (cues.includes("Объект перемещается по кадру")) {
      add(candidate, "object-moving", "Объект перемещается в кадре", ["Смещение обнаруженного объекта"], 0.7);
    }
    if (cues.includes("Объект приближается")) {
      add(candidate, "subject-approaching", "Объект визуально приближается", ["Увеличение площади объекта"], 0.68);
    }
    if (cues.includes("Объект удаляется")) {
      add(candidate, "subject-receding", "Объект визуально удаляется", ["Уменьшение площади объекта"], 0.68);
    }
  }

  events.sort((a, b) => a.sourceTime - b.sourceTime || a.kind.localeCompare(b.kind));
  const deduplicated: DirectorEventEvidence[] = [];
  for (const event of events) {
    const existing = [...deduplicated].reverse().find((item) =>
      item.kind === event.kind && Math.abs(item.sourceTime - event.sourceTime) <= mergeWindow
    );
    if (!existing) {
      deduplicated.push(event);
      continue;
    }
    existing.start = Math.min(existing.start, event.start);
    existing.end = Math.max(existing.end, event.end);
    existing.confidence = Math.max(existing.confidence, event.confidence);
    existing.evidence = [...new Set([...existing.evidence, ...event.evidence])];
  }
  return deduplicated.sort((a, b) => a.sourceTime - b.sourceTime || a.kind.localeCompare(b.kind));
}
