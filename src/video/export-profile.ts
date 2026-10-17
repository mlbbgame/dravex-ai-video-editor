export type ExportQuality = "preview" | "720p" | "1080p" | "4K";
export type ExportAspectRatio = "9:16" | "16:9" | "1:1" | "4:5";

export type ExportProfile = {
  width: number;
  height: number;
  frameRate: 24;
  videoBitsPerSecond: number;
  mimeTypeCandidates: readonly string[];
};

const BASE_DIMENSIONS: Record<Exclude<ExportQuality, "preview">, Record<ExportAspectRatio, { width: number; height: number }>> = {
  "720p": {
    "9:16": { width: 720, height: 1280 },
    "16:9": { width: 1280, height: 720 },
    "1:1": { width: 720, height: 720 },
    "4:5": { width: 720, height: 900 },
  },
  "1080p": {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
  },
  "4K": {
    "9:16": { width: 2160, height: 3840 },
    "16:9": { width: 3840, height: 2160 },
    "1:1": { width: 2160, height: 2160 },
    "4:5": { width: 2160, height: 2700 },
  },
};

const PREVIEW_DIMENSIONS: Record<ExportAspectRatio, { width: number; height: number }> = {
  "9:16": { width: 360, height: 640 },
  "16:9": { width: 480, height: 270 },
  "1:1": { width: 360, height: 360 },
  "4:5": { width: 360, height: 450 },
};

export const WEBM_MIME_CANDIDATES = [
  "video/webm;codecs=vp8",
  "video/webm",
  "video/webm;codecs=vp9",
] as const;

/** Keep resolution, frame rate and bitrate in one auditable export profile. */
export function getExportProfile(aspectRatio: string, quality: string): ExportProfile {
  const ratio = isAspectRatio(aspectRatio) ? aspectRatio : "9:16";
  const normalizedQuality: ExportQuality = quality === "preview" || quality === "1080p" || quality === "4K" ? quality : "720p";
  const dimensions = normalizedQuality === "preview"
    ? PREVIEW_DIMENSIONS[ratio]
    : BASE_DIMENSIONS[normalizedQuality][ratio];
  const bitrate: Record<ExportQuality, number> = {
    preview: 1_200_000,
    "720p": 6_000_000,
    "1080p": 12_000_000,
    "4K": 35_000_000,
  };
  return {
    ...dimensions,
    frameRate: 24,
    videoBitsPerSecond: bitrate[normalizedQuality],
    mimeTypeCandidates: WEBM_MIME_CANDIDATES,
  };
}

export function chooseSupportedWebmMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | null {
  return WEBM_MIME_CANDIDATES.find((mimeType) => {
    try { return isTypeSupported(mimeType); } catch { return false; }
  }) ?? null;
}

function isAspectRatio(value: string): value is ExportAspectRatio {
  return value === "9:16" || value === "16:9" || value === "1:1" || value === "4:5";
}
