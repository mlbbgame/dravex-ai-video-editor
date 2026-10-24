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
  const invalidSizeFiles = files.filter((file) => !Number.isFinite(file.size) || file.size <= 0);
  const totalBytes = files.reduce((total, file) => total + (Number.isFinite(file.size) ? Math.max(0, file.size) : 0), 0);

  if (invalidSizeFiles.length === 1) {
    errors.push(`Файл «${invalidSizeFiles[0].name}» пустой или имеет некорректный размер. Выбери другой файл.`);
  } else if (invalidSizeFiles.length > 1) {
    errors.push(`${invalidSizeFiles.length} файлов пустые или имеют некорректный размер. Удали их и попробуй снова.`);
  }
  const videos = files.filter((file) => getMediaKind(file) === "video");
  const images = files.filter((file) => getMediaKind(file) === "image");

  if (images.length > MAX_PHOTO_COUNT) {
    errors.push(`Можно добавить не более ${MAX_PHOTO_COUNT} фотографий за один раз. Раздели материал на несколько монтажей.`);
  }

  const largeVideos = videos.filter((file) => file.size >= LARGE_VIDEO_WARNING_BYTES);
  if (largeVideos.length === 1) {
    warnings.push(`Большое видео (${formatBytes(largeVideos[0].size)}). На телефоне анализ и экспорт могут занять больше времени; не закрывай вкладку.`);
  } else if (largeVideos.length > 1) {
    const largeVideoBytes = largeVideos.reduce((total, file) => total + file.size, 0);
    warnings.push(`Выбрано несколько больших видео (${largeVideos.length}; вместе ${formatBytes(largeVideoBytes)}). На Android лучше монтировать по одному видео за раз, чтобы снизить риск нехватки памяти.`);
  }

  if (images.some((file) => file.size >= LARGE_IMAGE_WARNING_BYTES)) {
    warnings.push("Есть фотографии большого размера. На слабом телефоне обработка может занять больше времени.");
  }

  if (images.length > 1 && images.reduce((total, file) => total + Math.max(0, file.size || 0), 0) >= LARGE_PHOTO_BATCH_WARNING_BYTES) {
    warnings.push("Общий размер фотографий большой. Если редактор зависает, попробуй уменьшить количество или размер исходников.");
  }

  // A large-video warning alone does not account for the combined memory pressure
  // of that video plus photos. Keep the single-file message concise, but warn when
  // the whole mixed selection is large enough to strain an Android browser.
  if (totalBytes >= VERY_LARGE_SELECTION_WARNING_BYTES && (largeVideos.length === 0 || images.length > 0)) {
    warnings.push(`Общий объём выбранных файлов — ${formatBytes(totalBytes)}. На Android это может привести к нехватке памяти при анализе или экспорте; при сбоях попробуй обработать видео отдельно или уменьшить число фотографий.`);
  }

  return { valid: errors.length === 0, totalBytes, errors, warnings };
}
