export type MediaKind = "image" | "video" | "unknown";

const imageExtensions = new Set(["avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "webp"]);
const videoExtensions = new Set(["3gp", "avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm"]);

/**
 * Android and desktop file pickers do not always provide a MIME type.
 * Prefer a real image/video MIME type, then fall back to the filename extension.
 */
export function getMediaKind(file: Pick<File, "name" | "type">): MediaKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  return "unknown";
}
