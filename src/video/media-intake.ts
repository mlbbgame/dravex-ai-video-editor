import { getMediaKind } from "./media-kind";

export type MediaIntakeFile = Pick<File, "name" | "type" | "size">;

export type MediaIntakeAssessment = {
  valid: boolean;
  totalBytes: number;
  errors: string[];
  warnings: string[];
};

const MAX_PHOTO_COUNT = 80;
const LARGE_VIDEO_WARNING_BYTES = 100 * 1024 * 1024;
const LARGE_IMAGE_WARNING_BYTES = 20 * 1024 * 1024;
const LARGE_PHOTO_BATCH_WARNING_BYTES = 120 * 1024 * 1024;
const VERY_LARGE_SELECTION_WARNING_BYTES = 400 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/**
 * Give Android users useful, early feedback before creating object URLs or
 * starting expensive decoding. Large media is warned about, not rejected:
 * the browser and device may still be able to process it.
 */
export function assessMediaSelection(files: readonly MediaIntakeFile[]): MediaIntakeAssessment {
  const errors: string[] = [];
  const warnings: string[] = [];
  const totalBytes = files.reduce((total, file) => total + Math.max(0, file.size || 0), 0);
  const videos = files.filter((file) => getMediaKind(file) === "video");
  const images = files.filter((file) => getMediaKind(file) === "image");

  if (images.length > MAX_PHOTO_COUNT) {
    errors.push(`Можно добавить не более ${MAX_PHOTO_COUNT} фотографий за один раз. Раздели материал на несколько монтажей.`);
  }

  if (videos.length === 1 && videos[0].size >= LARGE_VIDEO_WARNING_BYTES) {
    warnings.push(`Большое видео (${formatBytes(videos[0].size)}). На телефоне анализ и экспорт могут занять больше времени; не закрывай вкладку.`);
  }

  if (images.some((file) => file.size >= LARGE_IMAGE_WARNING_BYTES)) {
    warnings.push("Есть фотографии большого размера. На слабом телефоне обработка может занять больше времени.");
  }

  if (images.length > 1 && images.reduce((total, file) => total + Math.max(0, file.size || 0), 0) >= LARGE_PHOTO_BATCH_WARNING_BYTES) {
    warnings.push("Общий размер фотографий большой. Если редактор зависает, попробуй уменьшить количество или размер исходников.");
  }

  if (totalBytes >= VERY_LARGE_SELECTION_WARNING_BYTES && !warnings.some((warning) => warning.startsWith("Большое видео"))) {
    warnings.push(`Выбрано много данных (${formatBytes(totalBytes)}). Убедись, что на телефоне достаточно свободной памяти.`);
  }

  return { valid: errors.length === 0, totalBytes, errors, warnings };
}
