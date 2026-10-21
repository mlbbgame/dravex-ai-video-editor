export type DirectorDiagnosticType =
  | "montage-started"
  | "analysis-completed"
  | "analysis-fallback"
  | "render-started"
  | "export-ready"
  | "quality-check-completed"
  | "montage-failed";

export type DirectorDiagnosticDetails = {
  mediaKind?: "video" | "images" | "mixed";
  mediaCount?: number;
  durationSeconds?: number;
  sampledFrames?: number;
  candidateCount?: number;
  segmentCount?: number;
  style?: string;
  quality?: string;
  severity?: "ok" | "warning";
  findingCount?: number;
  fallbackUsed?: boolean;
  reasonCode?: "analysis-unavailable" | "render-error" | "quality-check-unavailable";
};

export type DirectorDiagnosticEvent = {
  version: 1;
  timestamp: string;
  type: DirectorDiagnosticType;
  details: DirectorDiagnosticDetails;
};

const ALLOWED_TYPES = new Set<DirectorDiagnosticType>([
  "montage-started", "analysis-completed", "analysis-fallback", "render-started",
  "export-ready", "quality-check-completed", "montage-failed"
]);
const ALLOWED_STYLES = new Set(["auto", "velocity", "cinematic", "story", "anime", "glitch"]);
const ALLOWED_QUALITIES = new Set(["720p", "1080p", "4K", "unknown"]);
const ALLOWED_MEDIA_KINDS = new Set(["video", "images", "mixed"]);
const ALLOWED_SEVERITIES = new Set(["ok", "warning"]);
const ALLOWED_REASON_CODES = new Set(["analysis-unavailable", "render-error", "quality-check-unavailable"]);
const INTEGER_KEYS = new Set(["mediaCount", "sampledFrames", "candidateCount", "segmentCount", "findingCount"]);
const ALLOWED_KEYS = new Set([
  "mediaKind", "mediaCount", "durationSeconds", "sampledFrames", "candidateCount",
  "segmentCount", "style", "quality", "severity", "findingCount", "fallbackUsed", "reasonCode"
]);

function safeTimestamp(value: unknown): string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value))
    ? value
    : new Date().toISOString();
}

/** Creates a privacy-safe event. File names, media bytes, URLs and free-form errors are never accepted. */
export function createDirectorDiagnostic(
  type: DirectorDiagnosticType,
  details: DirectorDiagnosticDetails = {},
  timestamp = new Date().toISOString()
): DirectorDiagnosticEvent {
  const safeTime = safeTimestamp(timestamp);
  const safe: DirectorDiagnosticDetails = {};
  if (!ALLOWED_TYPES.has(type)) {
    return { version: 1, timestamp: safeTime, type: "montage-failed", details: { reasonCode: "analysis-unavailable" } };
  }
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return { version: 1, timestamp: safeTime, type, details: safe };
  }
  for (const [key, value] of Object.entries(details)) {
    if (!ALLOWED_KEYS.has(key) || value === undefined) continue;
    if (key === "mediaKind" && !(typeof value === "string" && ALLOWED_MEDIA_KINDS.has(value))) continue;
    if (key === "style" && !(typeof value === "string" && ALLOWED_STYLES.has(value))) continue;
    if (key === "quality" && !(typeof value === "string" && ALLOWED_QUALITIES.has(value))) continue;
    if (key === "severity" && !(typeof value === "string" && ALLOWED_SEVERITIES.has(value))) continue;
    if (key === "reasonCode" && !(typeof value === "string" && ALLOWED_REASON_CODES.has(value))) continue;
    if (key === "fallbackUsed" && typeof value !== "boolean") continue;
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) continue;
    if (INTEGER_KEYS.has(key) && typeof value === "number" && !Number.isInteger(value)) continue;
    if (key === "durationSeconds" && typeof value === "number" && value > 24 * 60 * 60) continue;
    if (["mediaCount", "durationSeconds", "sampledFrames", "candidateCount", "segmentCount", "findingCount"].includes(key)
      && typeof value !== "number") continue;
    (safe as Record<string, unknown>)[key] = value;
  }
  return { version: 1, timestamp: safeTime, type, details: safe };
}

export function buildDirectorDiagnosticExport(events: DirectorDiagnosticEvent[]) {
  const safeEvents = Array.isArray(events) ? events.slice(-200) : [];
  return {
    schemaVersion: 1,
    product: "DRAVEX",
    privacy: "Local diagnostic metadata only; no media, filenames, URLs, or free-form errors.",
    eventCount: Array.isArray(events) ? events.length : 0,
    events: safeEvents
  };
}
