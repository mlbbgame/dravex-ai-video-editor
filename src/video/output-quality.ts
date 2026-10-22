export type OutputQualityReport = {
  frames: Array<{ time: number; dataUrl: string }>;
  duration: number;
  width: number;
  height: number;
  sampledFrames: number;
  blackFrameTimes: number[];
  frozenFramePairs: number[];
  findings: string[];
  severity: "ok" | "warning";
};

const waitForMediaEvent = (video: HTMLVideoElement, successEvent: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Истекло время ожидания декодирования видео.")); }, 12000);
    const onSuccess = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Браузер не смог декодировать экспортированное видео.")); };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(successEvent, onSuccess);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(successEvent, onSuccess, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

const seekTo = async (video: HTMLVideoElement, time: number) => {
  if (!Number.isFinite(time) || time < 0 || time >= video.duration) {
    throw new Error("Выбрана недопустимая точка для проверки видео.");
  }
  if (Math.abs(video.currentTime - time) < 0.025) return;

  // Attach listeners before seeking, and always remove them on success, timeout,
  // decoder error, or a synchronous currentTime exception. A rejected seek must
  // not leave a dangling 12-second promise/listener on mobile.
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onSeeked = () => finish();
    const onError = () => finish(new Error("Браузер не смог перейти к кадру для проверки экспорта."));
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    timeoutId = window.setTimeout(
      () => finish(new Error("Истекло время ожидания перехода к кадру экспортированного видео.")),
      12000,
    );
    try {
      video.currentTime = time;
    } catch {
      finish(new Error("Не удалось перейти к кадру экспортированного видео."));
    }
  });
};

export function isRenderedDurationWithinTolerance(actualDuration: number, expectedDuration: number, toleranceSeconds = 0.75): boolean {
  if (!Number.isFinite(actualDuration) || actualDuration <= 0 || !Number.isFinite(expectedDuration) || expectedDuration <= 0) return false;
  // Keep the guard deterministic if callers accidentally pass NaN, Infinity,
  // or a negative tolerance. Invalid tolerances use the same conservative
  // default as an omitted tolerance rather than disabling the duration check.
  const safeTolerance = Number.isFinite(toleranceSeconds) && toleranceSeconds >= 0
    ? toleranceSeconds
    : 0.75;
  const tolerance = Math.max(safeTolerance, expectedDuration * 0.05);
  return Math.abs(actualDuration - expectedDuration) <= tolerance;
}

/** Avoid treating adjacent samples from very short clips as evidence of a freeze. */
export function shouldCompareFrameSamples(sampleIntervalSeconds: number): boolean {
  return Number.isFinite(sampleIntervalSeconds) && sampleIntervalSeconds >= 0.5;
}

export function getOutputQualitySeverity(blackFrameTimes: readonly number[], frozenFramePairs: readonly number[], durationMismatch = false, dimensionMismatch = false): "ok" | "warning" {
  return blackFrameTimes.length || frozenFramePairs.length || durationMismatch || dimensionMismatch ? "warning" : "ok";
}

export function assertNonEmptyRenderedBlob(blob: Pick<Blob, "size">): void {
  if (!Number.isFinite(blob.size) || blob.size <= 0) {
    throw new Error("Экспорт вернул пустой файл. Повтори монтаж; если ошибка повторится, попробуй более короткий ролик.");
  }
}

export async function inspectRenderedVideo(
  blob: Blob,
  expectedDuration?: number,
  expectedDimensions?: { width: number; height: number },
): Promise<OutputQualityReport> {
  // Fail immediately for an empty recorder result instead of waiting for a media metadata timeout.
  assertNonEmptyRenderedBlob(blob);
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Register listeners before assigning src; cached/local blobs can emit metadata
  // almost immediately, otherwise the inspection may wait 12 seconds and fail.
  const metadataReady = waitForMediaEvent(video, "loadedmetadata");
  video.src = url;
  try {
    await metadataReady;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error("В экспортированном видео отсутствуют корректные метаданные.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas недоступен для проверки кадров.");
    const sampleCount = Math.min(9, Math.max(3, Math.ceil(video.duration / 3)));
    const times = Array.from({ length: sampleCount }, (_, index) => Math.min(Math.max(0, video.duration - 0.08), (video.duration * (index + 0.5)) / sampleCount));
    const blackFrameTimes: number[] = [];
    const frozenFramePairs: number[] = [];
    let previousPixels: Uint8ClampedArray | null = null;
    const frames: Array<{ time: number; dataUrl: string }> = [];
    for (const time of times) {
      await seekTo(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ time, dataUrl: canvas.toDataURL("image/jpeg", 0.68) });
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let totalLuma = 0;
      let veryDarkPixels = 0;
      let comparedPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const luma = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
        totalLuma += luma;
        if (luma < 18) veryDarkPixels += 1;
        comparedPixels += 1;
      }
      const averageLuma = totalLuma / Math.max(1, comparedPixels);
      if (averageLuma < 8 && veryDarkPixels / comparedPixels > 0.94) blackFrameTimes.push(time);
      // Very short clips can legitimately decode adjacent inspection points to
      // the same frame (especially on mobile). Only infer a freeze when samples
      // are at least half a second apart; black-frame and metadata checks still
      // run for every duration.
      if (previousPixels && shouldCompareFrameSamples(video.duration / sampleCount)) {
        let difference = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          difference += (Math.abs(pixels[offset] - previousPixels[offset]) + Math.abs(pixels[offset + 1] - previousPixels[offset + 1]) + Math.abs(pixels[offset + 2] - previousPixels[offset + 2])) / 3;
        }
        if (difference / comparedPixels < 1.2) frozenFramePairs.push(time);
      }
      previousPixels = new Uint8ClampedArray(pixels);
    }
    const findings: string[] = [];
    const durationMismatch = Number.isFinite(expectedDuration) && (expectedDuration as number) > 0
      && !isRenderedDurationWithinTolerance(video.duration, expectedDuration as number);
    const hasExpectedDimensions = expectedDimensions
      && Number.isFinite(expectedDimensions.width) && expectedDimensions.width > 0
      && Number.isFinite(expectedDimensions.height) && expectedDimensions.height > 0;
    const dimensionMismatch = Boolean(hasExpectedDimensions
      && (video.videoWidth !== expectedDimensions?.width || video.videoHeight !== expectedDimensions?.height));
    if (durationMismatch) findings.push(`Длительность экспорта (${video.duration.toFixed(1)} с) заметно отличается от запрошенной (${(expectedDuration as number).toFixed(1)} с). Проверь конечный ролик перед сохранением.`);
    if (dimensionMismatch && expectedDimensions) findings.push(`Размер экспорта (${video.videoWidth}×${video.videoHeight}) не совпадает с выбранным (${expectedDimensions.width}×${expectedDimensions.height}). Проверь профиль качества и конечный ролик.`);
    if (blackFrameTimes.length) findings.push("Обнаружены почти чёрные кадры около: " + blackFrameTimes.map((time) => time.toFixed(1) + " с").join(", ") + ". Проверь, не задуманы ли они как переход.");
    if (frozenFramePairs.length) findings.push("Некоторые контрольные точки почти не меняются (около " + frozenFramePairs.map((time) => time.toFixed(1) + " с").join(", ") + "). Это может быть статичный кадр или зависание — проверь воспроизведение.");
    if (!findings.length) findings.push("На контрольных точках явных чёрных кадров или почти одинаковых соседних кадров не обнаружено.");
    return { frames, duration: video.duration, width: video.videoWidth, height: video.videoHeight, sampledFrames: sampleCount, blackFrameTimes, frozenFramePairs, findings, severity: getOutputQualitySeverity(blackFrameTimes, frozenFramePairs, durationMismatch, dimensionMismatch) };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}