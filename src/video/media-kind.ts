export type MediaKind = "image" | "video" | "unknown";

const imageExtensions = new Set(["avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "webp"]);
const videoExtensions = new Set(["3gp", "avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm"]);

/**
 * Android and desktop file pickers do not always provide a MIME type.
 * Prefer a real image/video MIME type, then fall back to the filename extension.
 */
export function getMediaKind(file: Pick<File, "name" | "type">): MediaKind {
  // Some Android pickers report an incorrect MIME type for otherwise recognizable
  // files. Trust a known extension first, then use MIME as a fallback.
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";

  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "unknown";
}
