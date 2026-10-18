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
  if (Math.abs(video.currentTime - time) < 0.025) return;
  const seeked = waitForMediaEvent(video, "seeked");
  video.currentTime = time;
  await seeked;
};

export async function inspectRenderedVideo(blob: Blob): Promise<OutputQualityReport> {
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
      if (previousPixels) {
        let difference = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          difference += (Math.abs(pixels[offset] - previousPixels[offset]) + Math.abs(pixels[offset + 1] - previousPixels[offset + 1]) + Math.abs(pixels[offset + 2] - previousPixels[offset + 2])) / 3;
        }
        if (difference / comparedPixels < 1.2) frozenFramePairs.push(time);
      }
      previousPixels = new Uint8ClampedArray(pixels);
    }
    const findings: string[] = [];
    if (blackFrameTimes.length) findings.push("Обнаружены почти чёрные кадры около: " + blackFrameTimes.map((time) => time.toFixed(1) + " с").join(", ") + ". Проверь, не задуманы ли они как переход.");
    if (frozenFramePairs.length) findings.push("Некоторые контрольные точки почти не меняются (около " + frozenFramePairs.map((time) => time.toFixed(1) + " с").join(", ") + "). Это может быть статичный кадр или зависание — проверь воспроизведение.");
    if (!findings.length) findings.push("На контрольных точках явных чёрных кадров или почти одинаковых соседних кадров не обнаружено.");
    return { frames, duration: video.duration, width: video.videoWidth, height: video.videoHeight, sampledFrames: sampleCount, blackFrameTimes, frozenFramePairs, findings, severity: blackFrameTimes.length || frozenFramePairs.length ? "warning" : "ok" };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}