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

const ALLOWED_KEYS = new Set([
  "mediaKind", "mediaCount", "durationSeconds", "sampledFrames", "candidateCount",
  "segmentCount", "style", "quality", "severity", "findingCount", "fallbackUsed", "reasonCode"
]);

/** Creates a privacy-safe event. File names, media bytes, URLs and free-form errors are never accepted. */
export function createDirectorDiagnostic(
  type: DirectorDiagnosticType,
  details: DirectorDiagnosticDetails = {},
  timestamp = new Date().toISOString()
): DirectorDiagnosticEvent {
  const safe: DirectorDiagnosticDetails = {};
  for (const [key, value] of Object.entries(details)) {
    if (!ALLOWED_KEYS.has(key) || value === undefined) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    if (typeof value === "string" && value.length > 40) continue;
    (safe as Record<string, unknown>)[key] = value;
  }
  return { version: 1, timestamp, type, details: safe };
}

export function buildDirectorDiagnosticExport(events: DirectorDiagnosticEvent[]) {
  return {
    schemaVersion: 1,
    product: "DRAVEX",
    privacy: "Local diagnostic metadata only; no media, filenames, URLs, or free-form errors.",
    eventCount: events.length,
    events: events.slice(-200)
  };
}
