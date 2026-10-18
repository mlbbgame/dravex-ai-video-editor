export type MediaKind = "image" | "video" | "audio" | "unknown";

const imageExtensions = new Set(["avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "webp"]);
const videoExtensions = new Set(["3gp", "avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm"]);
const audioExtensions = new Set(["aac", "aif", "aiff", "alac", "flac", "m4a", "m4b", "mp3", "oga", "ogg", "opus", "wav", "weba", "wma"]);

/**
 * Android and desktop pickers sometimes omit or misreport MIME metadata.
 * Trust a recognized extension first, then use MIME as a fallback.
 */
export function getMediaKind(file: Pick<File, "name" | "type">): MediaKind {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";

  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "unknown";
}
