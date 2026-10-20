export type VideoSegment = {
  kind?: "video";
  name: string;
  url: string;
  trimStart: number;
  trimEnd: number;
};

export type ImageSegment = {
  kind: "image";
  name: string;
  url: string;
  duration?: number;
};

export type AudioSegment = {
  name: string;
  url: string;
  volume?: number;
};

export type SequenceRenderStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story" | "travel";

export type SequenceSegment = VideoSegment | ImageSegment;

/**
 * Keep the whole source visible when its aspect ratio differs from the output.
 * When ratios match, fill the frame instead of needlessly shrinking photos over
 * a blurred duplicate background.
 */
export function shouldContainSource(sourceAspect: number, outputAspect: number): boolean {
  if (!Number.isFinite(sourceAspect) || !Number.isFinite(outputAspect) || sourceAspect <= 0 || outputAspect <= 0) {
    return true;
  }
  return Math.abs(Math.log(sourceAspect / outputAspect)) > 0.18;
}

/**
 * A restrained action-edit speed ramp. Values are source playback speed, while
 * the output timeline keeps each shot's requested duration. Other styles stay
 * at normal speed so calm footage is not unintentionally sped up.
 */
export function getSpeedRampRate(style: SequenceRenderStyle, progress: number): number {
  if (style !== "velocity") return 1;
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const stops = [
    { at: 0, rate: 0.82 },
    { at: 0.2, rate: 1.02 },
    { at: 0.42, rate: 1.65 },
    { at: 0.62, rate: 0.9 },
    { at: 0.82, rate: 1.12 },
    { at: 1, rate: 1 }
  ];
  // Smoothstep's mean over each interval equals the mean of its endpoint
  // rates. Normalize the curve so it consumes approximately one source-second
  // per output-second; otherwise the faster sections reach the trim end early
  // and force the renderer to freeze a frame for the remainder of the shot.
  const averageRate = stops.slice(1).reduce((sum, right, index) => {
    const left = stops[index];
    return sum + (right.at - left.at) * (left.rate + right.rate) / 2;
  }, 0);
  for (let index = 1; index < stops.length; index += 1) {
    const left = stops[index - 1];
    const right = stops[index];
    if (t > right.at) continue;
    const linear = (t - left.at) / (right.at - left.at);
    const eased = linear * linear * (3 - 2 * linear);
    return (left.rate + (right.rate - left.rate) * eased) / averageRate;
  }
  return 1 / averageRate;
}

export type CameraMotionProfile = { zoom: number; pan: number };

/** Consistent motion tuning for cinematic photo/video moves, scaled by the chosen intensity. */
export function getCameraMotionProfile(
  style: SequenceRenderStyle,
  strength: "none" | "soft" | "balanced" | "strong" = "balanced"
): CameraMotionProfile {
  const scale = strength === "none" ? 0 : strength === "soft" ? 0.42 : strength === "strong" ? 1.28 : 1;
  const base = style === "velocity" ? { zoom: 0.145, pan: 0.072 }
    : style === "anime" ? { zoom: 0.12, pan: 0.055 }
      : style === "glitch" ? { zoom: 0.125, pan: 0.058 }
        : style === "travel" ? { zoom: 0.045, pan: 0.018 }
          : style === "story" ? { zoom: 0.072, pan: 0.032 }
            : { zoom: 0.115, pan: 0.052 };
  return { zoom: base.zoom * scale, pan: base.pan * scale };
}

type SequenceOptions = {
  segments: SequenceSegment[];
  audioTracks?: AudioSegment[];
  title: string;
  aspectRatio: string;
  quality?: string;
  style?: SequenceRenderStyle;
  effectStrength?: "none" | "soft" | "balanced" | "strong";
  transitionMode?: "auto" | "cinematic" | "action";
  suppressEffects?: boolean;
  suppressFlashes?: boolean;
  suppressShake?: boolean;
  suppressTransitions?: boolean;
  suppressAudio?: boolean;
  targetDurationSeconds?: number;
  onProgress?: (progress: number) => void;
  audioContext?: AudioContext;
};

type LoadedVideo = {
  kind: "video";
  name: string;
  video: HTMLVideoElement;
  start: number;
  end: number;
  duration: number;
};

type LoadedImage = {
  kind: "image";
  name: string;
  // Store a bounded-resolution canvas rather than keeping a full camera-resolution
  // decoded bitmap alive for every photo in the montage.
  image: HTMLCanvasElement;
  duration: number;
};

type LoadedSegment = LoadedVideo | LoadedImage;

type EbmlSize = { length: number; value: number; unknown: boolean };
type EbmlElement = { start: number; idLength: number; sizeStart: number; sizeLength: number; dataStart: number; dataEnd: number; size: number };

function ebmlVintLength(firstByte: number, maxLength = 8): number {
  let marker = 0x80;
  let length = 1;
  while (length <= maxLength && (firstByte & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  return length <= maxLength ? length : 0;
}

function readEbmlSize(bytes: Uint8Array, offset: number): EbmlSize | null {
  if (offset >= bytes.length) return null;
  const length = ebmlVintLength(bytes[offset], 8);
  if (!length || offset + length > bytes.length) return null;
  const marker = 1 << (8 - length);
  let value = bytes[offset] & (marker - 1);
  let unknown = value === marker - 1;
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + bytes[offset + index];
    if (bytes[offset + index] !== 0xff) unknown = false;
  }
  return { length, value, unknown };
}

function encodeEbmlSize(value: number, preferredLength = 1): Uint8Array {
  for (let length = Math.max(1, preferredLength); length <= 8; length += 1) {
    if (value > 2 ** (7 * length) - 2) continue;
    const encoded = new Uint8Array(length);
    let remaining = value;
    for (let index = length - 1; index >= 0; index -= 1) {
      encoded[index] = remaining & 0xff;
      remaining = Math.floor(remaining / 256);
    }
    encoded[0] |= 1 << (8 - length);
    return encoded;
  }
  throw new Error("WebM metadata size is too large to finalize.");
}

function ebmlIdHex(bytes: Uint8Array, offset: number, length: number): string {
  return Array.from(bytes.slice(offset, offset + length), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function findEbmlElement(
  bytes: Uint8Array,
  start: number,
  end: number,
  wantedId: string
): EbmlElement | null {
  let offset = start;
  while (offset + 5 < end) {
    const idLength = ebmlVintLength(bytes[offset], 4);
    if (!idLength || offset + idLength >= end) return null;
    const sizeStart = offset + idLength;
    const size = readEbmlSize(bytes, sizeStart);
    if (!size) return null;
    const dataStart = sizeStart + size.length;
    const dataEnd = size.unknown ? end : dataStart + size.value;
    if (dataEnd > end || dataEnd < dataStart) return null;
    if (ebmlIdHex(bytes, offset, idLength) === wantedId) {
      return { start: offset, idLength, sizeStart, sizeLength: size.length, dataStart, dataEnd, size: dataEnd - dataStart };
    }
    if (size.unknown) return null;
    offset = dataEnd;
  }
  return null;
}

/**
 * MediaRecorder WebM blobs can omit the Duration element, which makes browsers
 * report video.duration === Infinity and prevents reliable seeking. Add or update
 * the Matroska Duration value without re-encoding the recorded frames.
 */
async function finalizeWebmDuration(blob: Blob, durationSeconds: number): Promise<Blob> {
  if (!blob.type.includes("webm") || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const segmentStart = (() => {
    for (let index = 0; index + 4 <= bytes.length; index += 1) {
      if (bytes[index] === 0x18 && bytes[index + 1] === 0x53 && bytes[index + 2] === 0x80 && bytes[index + 3] === 0x67) return index;
    }
    return -1;
  })();
  if (segmentStart < 0) return blob;

  const segmentSize = readEbmlSize(bytes, segmentStart + 4);
  if (!segmentSize) return blob;
  const segmentDataStart = segmentStart + 4 + segmentSize.length;
  const segmentDataEnd = segmentSize.unknown ? bytes.length : Math.min(bytes.length, segmentDataStart + segmentSize.value);
  const info = findEbmlElement(bytes, segmentDataStart, segmentDataEnd, "1549a966");
  if (!info) return blob;

  let timecodeScale = 1_000_000;
  let durationElement: EbmlElement | null = null;
  let cursor = info.dataStart;
  while (cursor + 2 < info.dataEnd) {
    const idLength = ebmlVintLength(bytes[cursor], 4);
    if (!idLength) break;
    const sizeStart = cursor + idLength;
    const size = readEbmlSize(bytes, sizeStart);
    if (!size) break;
    const dataStart = sizeStart + size.length;
    const dataEnd = size.unknown ? info.dataEnd : dataStart + size.value;
    if (dataEnd > info.dataEnd || dataEnd < dataStart) break;
    const id = ebmlIdHex(bytes, cursor, idLength);
    if (id === "2ad7b1" && size.value > 0 && size.value <= 8) {
      let scale = 0;
      for (let index = dataStart; index < dataEnd; index += 1) scale = scale * 256 + bytes[index];
      if (scale > 0) timecodeScale = scale;
    } else if (id === "4489") {
      durationElement = { start: cursor, idLength, sizeStart, sizeLength: size.length, dataStart, dataEnd, size: size.value };
    }
    if (size.unknown) break;
    cursor = dataEnd;
  }

  const durationValue = durationSeconds * 1_000_000_000 / timecodeScale;
  if (durationElement) {
    const patched = bytes.slice();
    const view = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
    if (durationElement.size === 4) view.setFloat32(durationElement.dataStart, durationValue, false);
    else if (durationElement.size === 8) view.setFloat64(durationElement.dataStart, durationValue, false);
    else return blob;
    return new Blob([patched], { type: blob.type });
  }

  const durationBytes = new Uint8Array(11);
  durationBytes[0] = 0x44;
  durationBytes[1] = 0x89;
  durationBytes[2] = 0x88;
  new DataView(durationBytes.buffer).setFloat64(3, durationValue, false);

  const infoId = bytes.slice(info.start, info.start + info.idLength);
  const infoContent = bytes.slice(info.dataStart, info.dataEnd);
  const newInfoSize = infoContent.length + durationBytes.length;
  const encodedInfoSize = encodeEbmlSize(newInfoSize, info.sizeLength);
  const newInfo = new Uint8Array(infoId.length + encodedInfoSize.length + newInfoSize);
  newInfo.set(infoId, 0);
  newInfo.set(encodedInfoSize, infoId.length);
  newInfo.set(infoContent, infoId.length + encodedInfoSize.length);
  newInfo.set(durationBytes, infoId.length + encodedInfoSize.length + infoContent.length);

  const infoDelta = newInfo.length - (info.dataEnd - info.start);
  let patched = new Uint8Array(bytes.length + infoDelta);
  patched.set(bytes.slice(0, info.start), 0);
  patched.set(newInfo, info.start);
  patched.set(bytes.slice(info.dataEnd), info.start + newInfo.length);

  if (!segmentSize.unknown) {
    const encodedSegmentSize = encodeEbmlSize(segmentSize.value + infoDelta, segmentSize.length);
    const oldSizeEnd = segmentStart + 4 + segmentSize.length;
    if (encodedSegmentSize.length === segmentSize.length) {
      patched.set(encodedSegmentSize, segmentStart + 4);
    } else {
      const resized = new Uint8Array(patched.length + encodedSegmentSize.length - segmentSize.length);
      resized.set(patched.slice(0, segmentStart + 4), 0);
      resized.set(encodedSegmentSize, segmentStart + 4);
      resized.set(patched.slice(oldSizeEnd), segmentStart + 4 + encodedSegmentSize.length);
      patched = resized;
    }
  }
  return new Blob([patched], { type: blob.type });
}

/** Unlock Web Audio synchronously inside a user gesture before video analysis awaits. */
export function prepareAudioContextForUserGesture(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    const audioContext = new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
    return audioContext;
  } catch {
    return null;
  }
}

/** Normalize optional photo durations so malformed saved/project data cannot poison the render timeline. */
export function getSafeImageDuration(duration?: number): number {
  if (typeof duration !== "number" || !Number.isFinite(duration)) return 3;
  return Math.max(0.25, Math.min(duration, 30));
}

export const getOutputDimensions = (aspectRatio: string, quality = "720p") => {
  const multiplier = quality === "4K" ? 3 : quality === "1080p" ? 1.5 : 1;
  let base: { width: number; height: number };
  if (quality === "preview") base = aspectRatio === "16:9" ? { width: 480, height: 270 } : aspectRatio === "1:1" ? { width: 360, height: 360 } : aspectRatio === "4:5" ? { width: 360, height: 450 } : { width: 360, height: 640 };
  else if (aspectRatio === "16:9") base = { width: 1280, height: 720 };
  else if (aspectRatio === "1:1") base = { width: 720, height: 720 };
  else if (aspectRatio === "4:5") base = { width: 720, height: 900 };
  else base = { width: 720, height: 1280 };
  return { width: Math.round(base.width * multiplier), height: Math.round(base.height * multiplier) };
};

function loadVideo(segment: VideoSegment): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = false;
    video.playsInline = true;
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", failed);
    };
    const loaded = () => {
      cleanup();
      resolve(video);
    };
    const failed = () => {
      cleanup();
      // Release a broken or unsupported source immediately. This element is not
      // added to the loaded-segment cache when loading fails, so the outer cleanup
      // cannot otherwise release its decoder and object URL reference.
      video.pause();
      video.removeAttribute("src");
      video.load();
      reject(new Error(`Could not read video: ${segment.name}. Try MP4 (H.264) or WebM.`));
    };
    timeoutId = window.setTimeout(() => {
      cleanup();
      video.pause();
      video.removeAttribute("src");
      video.load();
      reject(new Error(`Видео «${segment.name}» не открылось за 20 секунд. Попробуй MP4 (H.264) или более короткий файл.`));
    }, 20_000);
    video.addEventListener("loadedmetadata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.src = segment.url;
    video.load();
  });
}

function loadImage(segment: ImageSegment, maxEdge: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
    };
    timeoutId = window.setTimeout(() => {
      cleanup();
      image.src = "";
      reject(new Error(`Фото «${segment.name}» не открылось за 15 секунд. Попробуй другой файл или уменьши размер изображения.`));
    }, 15_000);
    image.onload = () => {
      try {
        // Phone photos can be 12–50 megapixels. Decode at most two originals
        // at once, then retain only bounded canvases for the montage on Android.
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          cleanup();
          reject(new Error(`Could not prepare image for mobile rendering: ${segment.name}`));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        cleanup();
        image.src = "";
        resolve(canvas);
      } catch {
        cleanup();
        image.src = "";
        reject(new Error(`Could not prepare image for mobile rendering: ${segment.name}`));
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Could not read image: ${segment.name}`));
    };
    image.src = segment.url;
  });
}

function loadAudio(segment: AudioSegment): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    let timeoutId = 0;
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
    };
    const failed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      reject(new Error(`Не удалось прочитать аудиофайл «${segment.name}». Попробуй MP3, WAV или другой файл.`));
    };
    const loaded = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(audio);
    };
    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      reject(new Error(`Аудиофайл «${segment.name}» не открылся за 15 секунд. Попробуй MP3/WAV или другой файл.`));
    }, 15_000);
    audio.addEventListener("loadedmetadata", loaded, { once: true });
    audio.addEventListener("error", failed, { once: true });
    audio.src = segment.url;
    audio.load();
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.02) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => {
      cleanup();
      reject(new Error("Не удалось перейти к выбранному фрагменту. Попробуй другой видеофайл."));
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Переход к фрагменту занял слишком много времени. Попробуй более короткое видео."));
    }, 12000);
    try {
      video.currentTime = time;
    } catch {
      failed();
    }
  });
}

export async function renderVideoSequence({ segments, audioTracks = [], title, aspectRatio, quality = "720p", style = "cinematic", effectStrength = "balanced", transitionMode = "auto", suppressEffects = false, suppressFlashes = false, suppressShake = false, suppressTransitions = false, suppressAudio = false, targetDurationSeconds, onProgress, audioContext: preparedAudioContext }: SequenceOptions): Promise<Blob> {
  if (!segments.length) throw new Error("Import at least one video clip or image before rendering.");
  if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support video recording. Try a recent version of Chrome.");
  // Prefer VP8 on mobile: some Android encoders claim VP9 support but return an empty recording.
  const mimeType = ["video/webm;codecs=vp8", "video/webm", "video/webm;codecs=vp9"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("This browser does not support WebM video export.");

  // Reuse one media element per source URL. Long highlight edits may contain many trims from the same source.
  const videoCache = new Map<string, Promise<HTMLVideoElement>>();
  // Do not decode every high-resolution phone photo (or initialize every source
  // video) at once. A two-worker pool caps peak memory on Android while keeping
  // segment order stable in the resulting timeline.
  const loaded: LoadedSegment[] = new Array(segments.length);
  // One idempotent release path prevents decoded media from lingering if any
  // preparation stage fails before MediaRecorder's normal onstop cleanup runs.
  const releaseLoadedVisuals = () => {
    new Set(loaded.filter((item): item is LoadedVideo => item?.kind === "video").map((item) => item.video)).forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
    loaded.filter((item): item is LoadedImage => item?.kind === "image").forEach(({ image }) => {
      image.width = 1;
      image.height = 1;
    });
  };
  const releaseLoadedAudio = (items: { audio: HTMLAudioElement }[]) => {
    items.forEach(({ audio }) => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    });
  };
  let nextSegmentIndex = 0;
  let loadError: unknown = null;
  const loaderCount = Math.min(2, segments.length);
  await Promise.all(Array.from({ length: loaderCount }, async () => {
    while (nextSegmentIndex < segments.length && !loadError) {
      const index = nextSegmentIndex;
      nextSegmentIndex += 1;
      const segment = segments[index];
      try {
        if (segment.kind === "image") {
          const image = await loadImage(segment, quality === "4K" ? 3840 : quality === "1080p" ? 1920 : 1280);
          loaded[index] = { kind: "image", name: segment.name, image, duration: getSafeImageDuration(segment.duration) };
          continue;
        }
        const videoSegment = segment as VideoSegment;
        let pendingVideo = videoCache.get(videoSegment.url);
        if (!pendingVideo) {
          pendingVideo = loadVideo(videoSegment);
          videoCache.set(videoSegment.url, pendingVideo);
        }
        const video = await pendingVideo;
        if (suppressAudio) video.muted = true;
        const start = Math.max(0, Math.min(videoSegment.trimStart || 0, Math.max(0, video.duration - 0.1)));
        const requestedEnd = videoSegment.trimEnd > 0 ? videoSegment.trimEnd : video.duration;
        const end = Math.max(start + 0.1, Math.min(requestedEnd, video.duration));
        loaded[index] = { kind: "video", name: segment.name, video, start, end, duration: end - start };
      } catch (error) {
        loadError ??= error;
      }
    }
  }));
  if (loadError) {
    // A failed file must not leave already-decoded source media alive in the
    // background after the UI has reported the export error.
    releaseLoadedVisuals();
    throw loadError instanceof Error ? loadError : new Error("Не удалось подготовить исходные файлы для монтажа.");
  }
  const sourceDuration = loaded.reduce((sum, item) => sum + item.duration, 0);
  if (sourceDuration <= 0) throw new Error("The selected trim ranges are empty.");
  // Keep every imported visual in the chosen order while fitting an overlong sequence to the target length.
  if (targetDurationSeconds && Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0) {
    if (sourceDuration > targetDurationSeconds) {
      const scale = targetDurationSeconds / sourceDuration;
      for (const item of loaded) {
        item.duration *= scale;
        if (item.kind === "video") item.end = item.start + item.duration;
      }
    } else if (loaded.every((item) => item.kind === "image")) {
      // A still-image sequence can hold on its images to fill the requested duration, including when audio is present.
      const scale = targetDurationSeconds / sourceDuration;
      for (const item of loaded) item.duration *= scale;
    }
  }
  const totalDuration = loaded.reduce((sum, item) => sum + item.duration, 0);
  // Load music with explicit failure cleanup. Promise.all rejects as soon as
  // one track fails, but other tracks may already have decoded metadata and
  // source videos are already resident; release all fulfilled media before
  // reporting the import error to the UI.
  const audioResults = await Promise.allSettled(audioTracks.map(async (segment) => ({
    segment,
    audio: await loadAudio(segment)
  })));
  const loadedAudio = audioResults
    .filter((result): result is PromiseFulfilledResult<{ segment: AudioSegment; audio: HTMLAudioElement }> => result.status === "fulfilled")
    .map((result) => result.value);
  const audioLoadFailure = audioResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (audioLoadFailure) {
    releaseLoadedVisuals();
    releaseLoadedAudio(loadedAudio);
    throw audioLoadFailure.reason instanceof Error
      ? audioLoadFailure.reason
      : new Error("Не удалось загрузить одну из музыкальных дорожек.");
  }

  const { width, height } = getOutputDimensions(aspectRatio, quality);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    releaseLoadedVisuals();
    throw new Error("Could not initialize the video renderer.");
  }

  const videoStream = canvas.captureStream(24);
  // Do not create an AudioContext for a no-music export. On some Android
  // Chrome devices, adding an otherwise-unused Web Audio track can prevent
  // MediaRecorder from emitting video data. The no-music path records video-only.
  // Preserve source-video audio by default; when a music track is added, duck the original audio underneath it.
  const hasSourceVideo = !suppressAudio && loaded.some((item) => item.kind === "video");
  const audioContext = (loadedAudio.length > 0 || hasSourceVideo) && typeof AudioContext !== "undefined" ? preparedAudioContext ?? new AudioContext() : null;
  const audioDestination = audioContext?.createMediaStreamDestination();
  const musicGainNodes = new Map<HTMLAudioElement, GainNode>();
  if (audioContext && audioDestination) {
    const connectedVideoElements = new Set<HTMLVideoElement>();
    for (const item of loaded) {
      if (item.kind !== "video" || connectedVideoElements.has(item.video)) continue;
      connectedVideoElements.add(item.video);
      const source = audioContext.createMediaElementSource(item.video);
      const sourceGain = audioContext.createGain();
      sourceGain.gain.value = loadedAudio.length > 0 ? 0.28 : 1;
      source.connect(sourceGain);
      sourceGain.connect(audioDestination);
    }
    for (const item of loadedAudio) {
      const source = audioContext.createMediaElementSource(item.audio);
      const gain = audioContext.createGain();
      // Fade automation is scheduled once the render starts to avoid abrupt music edges.
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(audioDestination);
      item.audio.loop = true;
      musicGainNodes.set(item.audio, gain);
    }
  }
  if (loadedAudio.length > 0 && (!audioContext || !audioDestination)) {
    throw new Error("Не удалось подготовить аудиодорожку. Открой DRAVEX в актуальном Chrome и повтори экспорт.");
  }
  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...(audioDestination?.stream.getAudioTracks() ?? [])
  ]);
  if (!stream.getVideoTracks().some((track) => track.readyState === "live")) {
    throw new Error("Не удалось запустить видеопоток с холста. Перезагрузи страницу и попробуй ещё раз.");
  }
  if (loadedAudio.length > 0 && !stream.getAudioTracks().some((track) => track.readyState === "live")) {
    throw new Error("Музыкальная дорожка не подключилась к экспорту. Музыка не будет молча пропущена — обнови страницу и попробуй ещё раз.");
  }
  const bitrate = quality === "preview" ? 1_200_000 : quality === "4K" ? 24_000_000 : quality === "1080p" ? 12_000_000 : 6_000_000;
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  const chunks: BlobPart[] = [];
  const result = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error("The browser stopped recording unexpectedly."));
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      videoStream.getTracks().forEach((track) => track.stop());
      const uniqueVideos = new Set(loaded.filter((item): item is LoadedVideo => item.kind === "video").map((item) => item.video));
      uniqueVideos.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
      loadedAudio.forEach(({ audio }) => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      });
      if (audioContext && audioContext !== preparedAudioContext) void audioContext.close();
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size) {
        try {
          resolve(await finalizeWebmDuration(blob, totalDuration));
        } catch {
          // Preserve a playable recording even if an unusual WebM variant cannot be patched.
          resolve(blob);
        }
      } else {
        const videoTrackState = videoStream.getVideoTracks().map((track) => track.readyState).join(",") || "нет";
        reject(new Error(`Chrome завершил запись без видеоданных (кодек: ${mimeType}; состояние записи: ${recorder.state}; видеодорожка: ${videoTrackState}). Обнови страницу и попробуй снова. Если ошибка повторится, пришли мне этот текст полностью.`));
      }
    };
  });

  const previousFrameCanvas = document.createElement("canvas");
  previousFrameCanvas.width = width;
  previousFrameCanvas.height = height;
  const previousFrameContext = previousFrameCanvas.getContext("2d");
  let hasPreviousFrame = false;

  const savePreviousFrame = () => {
    if (!previousFrameContext) return;
    previousFrameContext.clearRect(0, 0, width, height);
    previousFrameContext.drawImage(canvas, 0, 0, width, height);
    hasPreviousFrame = true;
  };

  const draw = (source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, progress = 0, cutProgress = 1, cutIndex = 0) => {
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth
      : source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight
      : source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
    if (!sourceWidth || !sourceHeight) return;
    const transitionDuration = style === "travel" ? 0.82 : transitionMode === "cinematic" ? 0.58 : transitionMode === "action" ? 0.3 : style === "velocity" ? 0.34 : style === "glitch" ? 0.3 : 0.42;
    const transitionWindow = !suppressTransitions && cutIndex > 0 && hasPreviousFrame && cutProgress >= 0 && cutProgress < transitionDuration;
    const transitionProgress = transitionWindow ? Math.max(0, Math.min(1, cutProgress / transitionDuration)) : 1;
    // Native-canvas transition families; no extra library or network asset is required.
    const actionTransitions = [0, 3, 4, 5, 7];
    // Auto mode follows the edit's visual language instead of cycling through every
    // transition at random: calm edits stay clean, action edits use short impact reveals.
    const calmTransitions = [8, 0, 8, 0];
    const animeTransitions = [0, 3, 4, 7];
    const glitchTransitions = [0, 3, 5, 7];
    const transitionIndex = Math.max(0, cutIndex - 1);
    const transitionType = style === "travel" || effectStrength === "none"
      ? 8
      : transitionMode === "cinematic"
        ? (cutIndex % 2 === 0 ? 8 : 0)
      : transitionMode === "action"
        ? actionTransitions[transitionIndex % actionTransitions.length]
        : style === "cinematic" || style === "story"
          ? calmTransitions[transitionIndex % calmTransitions.length]
          : style === "glitch"
            ? glitchTransitions[transitionIndex % glitchTransitions.length]
            : style === "anime"
              ? animeTransitions[transitionIndex % animeTransitions.length]
              : actionTransitions[transitionIndex % actionTransitions.length];
    context.fillStyle = "#090b12";
    context.fillRect(0, 0, width, height);
    // Keep the outgoing shot underneath the incoming shot so transitions never reveal a black gap.
    if (transitionWindow) context.drawImage(previousFrameCanvas, 0, 0, width, height);

    // DRAVEX Camera V2: eased push/pull plus varied directional paths for stills.
    const strengthScale = effectStrength === "none" ? 0 : effectStrength === "soft" ? 0.42 : effectStrength === "strong" ? 1.28 : 1;
    const cameraMotion = getCameraMotionProfile(style, effectStrength);
    const motion = suppressEffects || effectStrength === "none" ? 0 : cameraMotion.zoom;
    const isPhoto = !(source instanceof HTMLVideoElement);
    const eased = progress * progress * (3 - 2 * progress);
    const zoomDirection = cutIndex % 2 === 0 ? 1 : -1;
    const zoomBase = isPhoto ? 1.035 : 1.04;
    const zoom = zoomBase + (zoomDirection > 0 ? eased : 1 - eased) * motion;
    // Avoid destroying the subject when a landscape clip is exported as a vertical Short.
    // Use a blurred fill behind a contained foreground whenever source/output framing differs noticeably.
    const sourceAspect = sourceWidth / sourceHeight;
    const outputAspect = width / height;
    const useContain = shouldContainSource(sourceAspect, outputAspect);
    const scale = (useContain ? Math.min(width / sourceWidth, height / sourceHeight) : Math.max(width / sourceWidth, height / sourceHeight)) * zoom;
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const panAmount = suppressEffects || effectStrength === "none" ? 0 : cameraMotion.pan;
    // Travel across the frame instead of easing from a static center to one side.
    // The symmetric path makes movement perceptible at the start and end of each still.
    const panPhase = eased * Math.PI;
    const pathX = [1, -1, 0.72, -0.72, 0.45, -0.45][cutIndex % 6];
    const pathY = [0, 0, -0.65, 0.65, 1, -1][cutIndex % 6];
    const panX = Math.cos(panPhase) * width * panAmount * pathX;
    const panY = Math.cos(panPhase) * height * panAmount * pathY;
    const shake = !suppressEffects && effectStrength !== "none" && !suppressShake && cutProgress < 0.22 && style !== "story" && style !== "travel" ? (1 - cutProgress / 0.22) * (style === "velocity" ? 0.018 : 0.006) * strengthScale : 0;
    const offsetX = panX + Math.sin(progress * 71) * width * shake;
    const offsetY = panY + Math.cos(progress * 83) * height * shake;
    const drawX = (width - drawWidth) / 2 + offsetX;
    const drawY = (height - drawHeight) / 2 + offsetY;
    const drawIncoming = () => {
      if (useContain) {
        // A soft, darkened fill avoids black bars while keeping the entire photo/clip visible.
        context.save();
        context.filter = "blur(24px) brightness(0.58) saturate(0.88)";
        const backgroundScale = Math.max(width / sourceWidth, height / sourceHeight) * 1.18;
        const backgroundWidth = sourceWidth * backgroundScale;
        const backgroundHeight = sourceHeight * backgroundScale;
        context.drawImage(source, (width - backgroundWidth) / 2, (height - backgroundHeight) / 2, backgroundWidth, backgroundHeight);
        context.restore();
        context.save();
        context.shadowColor = "rgba(0,0,0,0.32)";
        context.shadowBlur = Math.max(8, width * 0.012);
        context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
        context.restore();
      } else {
        context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      }
    };

    context.save();
    context.filter = suppressEffects || effectStrength === "none" ? "none" : style === "travel" ? "contrast(1.02) saturate(1.02) brightness(1.01)" : style === "cinematic" ? "contrast(1.08) saturate(1.08)" : style === "anime" ? "contrast(1.1) saturate(1.2)" : style === "velocity" ? "contrast(1.12) saturate(1.16)" : style === "glitch" ? "contrast(1.15) saturate(1.22)" : "contrast(1.03) saturate(1.03)";
    if (transitionWindow && transitionType === 0) {
      // Fast punch zoom; preserve the full-photo treatment on still images.
      const punch = 1 + (1 - transitionProgress) * (style === "velocity" ? 0.24 : 0.14) * strengthScale;
      context.globalAlpha = Math.min(1, transitionProgress * 1.8 + 0.08);
      if (useContain) {
        context.translate(width / 2, height / 2);
        context.scale(punch, punch);
        context.translate(-width / 2, -height / 2);
        drawIncoming();
      } else {
        const dw = drawWidth * punch;
        const dh = drawHeight * punch;
        context.drawImage(source, (width - dw) / 2 + offsetX, (height - dh) / 2 + offsetY, dw, dh);
      }
    } else if (transitionWindow && transitionType === 8) {
      // A true crossfade keeps the outgoing frame underneath and fades the new shot in.
      context.globalAlpha = transitionProgress;
      drawIncoming();
    } else if (transitionWindow && (transitionType === 1 || transitionType === 2)) {
      // Directional wipes alternate left-to-right and right-to-left.
      const revealWidth = width * Math.max(0.025, transitionProgress);
      context.beginPath();
      context.rect(transitionType === 1 ? 0 : width - revealWidth, 0, revealWidth, height);
      context.clip();
      drawIncoming();
    } else if (transitionWindow && transitionType === 3) {
      // Diagonal slash reveal.
      const edge = (width + height) * transitionProgress;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(Math.min(width, edge), 0);
      context.lineTo(Math.max(0, edge - height), height);
      context.lineTo(0, height);
      context.closePath();
      context.clip();
      drawIncoming();
    } else if (transitionWindow && transitionType === 4) {
      // Short rotational reveal with a restrained zoom.
      const angle = (1 - transitionProgress) * (style === "velocity" ? 0.15 : 0.085) * strengthScale;
      const punch = 1 + (1 - transitionProgress) * 0.13 * strengthScale;
      context.translate(width / 2, height / 2);
      context.rotate(angle);
      context.globalAlpha = Math.min(1, transitionProgress * 2 + 0.05);
      if (useContain) {
        context.scale(punch, punch);
        context.translate(-width / 2, -height / 2);
        drawIncoming();
      } else {
        context.drawImage(source, -drawWidth * punch / 2 + offsetX, -drawHeight * punch / 2 + offsetY, drawWidth * punch, drawHeight * punch);
      }
    } else if (transitionWindow && transitionType === 5) {
      // Eight staggered horizontal shutters.
      const strips = 8;
      const stripHeight = height / strips;
      for (let strip = 0; strip < strips; strip++) {
        const localProgress = Math.max(0, Math.min(1, (transitionProgress - strip * 0.035) * 1.45));
        const revealHeight = stripHeight * localProgress;
        const fromBottom = strip % 2 === 1;
        context.save();
        context.beginPath();
        context.rect(0, strip * stripHeight + (fromBottom ? stripHeight - revealHeight : 0), width, revealHeight);
        context.clip();
        drawIncoming();
        context.restore();
      }
    } else if (transitionWindow && transitionType === 6) {
      // Radial iris opens from the center of the frame.
      const radius = Math.hypot(width, height) * transitionProgress * 0.72;
      context.beginPath();
      context.arc(width / 2, height / 2, Math.max(1, radius), 0, Math.PI * 2);
      context.clip();
      drawIncoming();
    } else if (transitionWindow && transitionType === 7) {
      // Split reveal expands from the center to both edges.
      const halfReveal = width * 0.5 * transitionProgress;
      context.beginPath();
      context.rect(width / 2 - halfReveal, 0, halfReveal * 2, height);
      context.clip();
      drawIncoming();
    } else {
      // Normal shot; keep the image fully readable after its transition window.
      context.globalAlpha = transitionWindow ? Math.min(1, transitionProgress * 2.2 + 0.05) : 1;
      if (transitionWindow && style === "velocity") {
        context.filter = "blur(" + ((1 - transitionProgress) * Math.min(16, width * 0.012)) + "px) " + context.filter;
      }
      drawIncoming();
    }
    context.restore();
    if (!suppressEffects && effectStrength !== "none") {
      const shade = context.createLinearGradient(0, height * 0.6, 0, height);
      shade.addColorStop(0, "rgba(5,7,12,0)");
      shade.addColorStop(1, style === "travel" ? "rgba(5,7,12,0.07)" : "rgba(5,7,12,0.18)");
      context.fillStyle = shade;
      context.fillRect(0, 0, width, height);
    }
    // A short, restrained flash and edge darkening make cuts feel deliberate without burying the footage.
    if (!suppressEffects && effectStrength !== "none" && !suppressFlashes && cutProgress >= 0 && cutProgress < 0.14 && style !== "story" && style !== "travel") {
      const flash = (1 - cutProgress / 0.14) * (style === "velocity" ? 0.32 : style === "glitch" ? 0.24 : style === "anime" ? 0.2 : 0.12) * strengthScale;
      context.fillStyle = `rgba(245,248,255,${flash})`;
      context.fillRect(0, 0, width, height);
    }
    if (!suppressEffects && effectStrength !== "none" && !suppressFlashes && style === "glitch" && cutProgress >= 0 && cutProgress < 0.16) {
      const glitchStrength = (1 - cutProgress / 0.16) * strengthScale;
      // Split short horizontal slices for a more readable digital-impact effect than a full-frame tint alone.
      context.save();
      context.globalAlpha = Math.min(0.34, 0.22 * glitchStrength);
      context.globalCompositeOperation = "screen";
      const bands = [
        { y: 0.22, h: 0.055, x: -0.018 },
        { y: 0.48, h: 0.035, x: 0.024 },
        { y: 0.71, h: 0.045, x: -0.012 }
      ];
      for (const band of bands) {
        context.save();
        context.beginPath();
        context.rect(0, height * band.y, width, height * band.h);
        context.clip();
        context.drawImage(source, drawX + width * band.x * glitchStrength, drawY, drawWidth, drawHeight);
        context.fillStyle = band.x > 0 ? "rgba(255,35,100,0.34)" : "rgba(40,220,255,0.34)";
        context.fillRect(0, height * band.y, width, height * band.h);
        context.restore();
      }
      context.restore();
      context.fillStyle = `rgba(40,220,255,${glitchStrength * 0.12})`;
      context.fillRect(0, 0, width, height);
    }

    // Directional light streaks add a quick action accent without obscuring the photo.
    if (!suppressEffects && effectStrength !== "none" && !suppressFlashes && style === "velocity" && cutProgress >= 0 && cutProgress < 0.28) {
      const streakAlpha = (1 - cutProgress / 0.28) * 0.27 * strengthScale;
      context.save();
      context.strokeStyle = `rgba(235,245,255,${streakAlpha})`;
      context.lineWidth = Math.max(2, width * 0.003);
      for (let streak = 0; streak < 7; streak++) {
        const y = height * (0.12 + streak * 0.13) + cutProgress * height * 0.34;
        context.beginPath();
        context.moveTo(width * 0.56, y);
        context.lineTo(width * 1.05, y - height * 0.16);
        context.stroke();
      }
      context.restore();
    }
    if (!suppressEffects && effectStrength !== "none") {
      const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.72);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, style === "travel" ? "rgba(0,0,0,0.04)" : style === "story" ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.14)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
    }
    const cleanTitle = title.trim().replace(/\s+/g, " ").slice(0, 48);
    if (cleanTitle) {
      const fontSize = Math.max(24, Math.round(width * 0.045));
      context.font = `700 ${fontSize}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillStyle = "#fff";
      context.shadowColor = "rgba(0,0,0,0.65)";
      context.shadowBlur = 8;
      const lines: string[] = [];
      let line = "";
      for (const word of cleanTitle.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width > width * 0.84 && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
      const visibleLines = lines.slice(0, 2);
      visibleLines.forEach((text, index) => {
        context.fillText(text, width / 2, height * 0.88 + (index - visibleLines.length + 1) * fontSize * 1.15, width * 0.86);
      });
      context.shadowBlur = 0;
    }
  };

  if (audioContext?.state === "suspended") await audioContext.resume();
  recorder.start(1000);
  let completed = 0;
  try {
    if (audioContext && loadedAudio.length) {
      const audioStart = audioContext.currentTime;
      await Promise.all(loadedAudio.map(async ({ audio, segment }) => {
        audio.currentTime = 0;
        const gain = musicGainNodes.get(audio);
        const targetVolume = Math.max(0, Math.min(1, segment.volume ?? 0.65));
        if (gain) {
          gain.gain.cancelScheduledValues(audioStart);
          const fadeInSeconds = Math.min(0.65, totalDuration * 0.15);
          const fadeOutSeconds = Math.min(0.9, totalDuration * 0.2);
          const endTime = audioStart + totalDuration;
          const fadeStart = Math.max(audioStart + fadeInSeconds, endTime - fadeOutSeconds);
          gain.gain.setValueAtTime(0, audioStart);
          gain.gain.linearRampToValueAtTime(targetVolume, audioStart + fadeInSeconds);
          gain.gain.setValueAtTime(targetVolume, fadeStart);
          gain.gain.linearRampToValueAtTime(0, endTime);
        }
        try {
          await audio.play();
        } catch {
          throw new Error("Браузер заблокировал музыку при экспорте. Нажми «Создать монтаж» ещё раз; если не поможет, обнови страницу и попробуй Chrome.");
        }
      }));
    }
    for (const [cutIndex, item] of loaded.entries()) {
      if (item.kind === "image") {
        const segmentStartedAt = performance.now();
        while (performance.now() - segmentStartedAt < item.duration * 1000) {
          const elapsedSeconds = (performance.now() - segmentStartedAt) / 1000;
          const segmentProgress = Math.min(1, elapsedSeconds / item.duration);
          draw(item.image, segmentProgress, elapsedSeconds, cutIndex);
          onProgress?.(Math.min(99, Math.round(((completed + segmentProgress * item.duration) / totalDuration) * 100)));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        savePreviousFrame();
        completed += item.duration;
        continue;
      }

      const { video, start, end, duration } = item;
      video.pause();
      video.playbackRate = 1;
      if ("preservesPitch" in video) video.preservesPitch = true;
      await seek(video, start);
      await video.play();
      const clipStartedAt = performance.now();
      let sourceEnded = false;
      while (performance.now() - clipStartedAt < duration * 1000) {
        const elapsedSeconds = (performance.now() - clipStartedAt) / 1000;
        const clipProgress = Math.min(1, elapsedSeconds / duration);
        // Speed changes are limited to action/velocity edits. If a speed-up
        // reaches the selected trim end early, freeze that last frame rather
        // than accidentally revealing footage outside the user's chosen range.
        video.playbackRate = sourceEnded ? 1 : getSpeedRampRate(style, clipProgress);
        if (!sourceEnded && video.currentTime >= end - 0.04) {
          video.pause();
          // Playback-rate changes can step past the trim boundary between
          // animation frames; seek back inside the selected range before holding.
          await seek(video, Math.max(start, end - 0.06));
          sourceEnded = true;
          video.playbackRate = 1;
        }
        draw(video, clipProgress, elapsedSeconds, cutIndex);
        onProgress?.(Math.min(99, Math.round(((completed + clipProgress * duration) / totalDuration) * 100)));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      video.pause();
      video.playbackRate = 1;
      savePreviousFrame();
      completed += duration;
    }
    const last = loaded[loaded.length - 1];
    // Keep the final canvas frame alive long enough for mobile MediaRecorder implementations.
    draw(last.kind === "video" ? last.video : last.image, 1, 1, loaded.length - 1);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await new Promise((resolve) => window.setTimeout(resolve, 500));

    // Flush the final encoded data before stopping; some Android browsers otherwise
    // stop before delivering the last (or only) dataavailable chunk.
    if (recorder.state === "recording" && typeof recorder.requestData === "function") {
      await new Promise<void>((resolve) => {
        let settled = false;
        let timeoutId = 0;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          recorder.removeEventListener("dataavailable", finish);
          resolve();
        };
        timeoutId = window.setTimeout(finish, 1500);
        recorder.addEventListener("dataavailable", finish, { once: true });
        try { recorder.requestData(); } catch { finish(); }
      });
    }
    recorder.stop();
  } catch (error) {
    if (recorder.state !== "inactive") recorder.stop();
    throw error;
  }

  const blob = await result;
  onProgress?.(100);
  return blob;
}
