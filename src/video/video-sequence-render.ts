import {
  validateEditTimeline,
  type EditTimeline,
  type TimelineAudioTrack,
  type TimelineClip,
  type TimelineSource,
} from "./timeline-contract";
import { getColorGradeFilter, getSpeedRampRate } from "./motion-engine";
import { chooseSupportedWebmMimeType, getExportProfile } from "./export-profile";

export type VideoSegment = {
  kind?: "video";
  name: string;
  url: string;
  trimStart: number;
  trimEnd: number;
  /** Planned playback speed multiplier from the validated AI Director plan. */
  speedFactor?: number;
  /** Duration of the transition after this clip, in seconds. */
  transitionOutSeconds?: number;
  /** Optional allowlisted per-clip visual effects from the Director plan. */
  effects?: string[];
};

/** Normalize optional photo durations so malformed saved/project data cannot poison the render timeline. */
export function getSafeImageDuration(duration?: number): number {
  if (typeof duration !== "number" || !Number.isFinite(duration)) return 3;
  return Math.max(0.25, Math.min(duration, 30));
}

export type ImageSegment = {
  kind: "image";
  name: string;
  url: string;
  duration?: number;
  /** Duration of the transition after this still, in seconds. */
  transitionOutSeconds?: number;
  effects?: string[];
};

export type AudioSegment = {
  name: string;
  url: string;
  volume?: number;
};

export type SequenceRenderStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story";
export type FramingMode = "auto" | "fit" | "fill";

export type SequenceSegment = VideoSegment | ImageSegment;

/**
 * Keep the whole source visible when its aspect ratio differs from the output.
 * When ratios match, fill the frame instead of needlessly shrinking photos over
 * a blurred duplicate background.
 */
export function shouldContainSource(sourceAspect: number, outputAspect: number, framingMode: FramingMode = "auto"): boolean {
  if (framingMode === "fit") return true;
  if (framingMode === "fill") return false;
  if (!Number.isFinite(sourceAspect) || !Number.isFinite(outputAspect) || sourceAspect <= 0 || outputAspect <= 0) {
    return true;
  }
  return Math.abs(Math.log(sourceAspect / outputAspect)) > 0.18;
}

export type CameraMotionProfile = { zoom: number; pan: number };

/** Consistent motion tuning for cinematic photo/video moves, scaled by the chosen intensity. */
export function getCameraMotionProfile(
  style: SequenceRenderStyle,
  strength: "soft" | "balanced" | "strong" = "balanced"
): CameraMotionProfile {
  const scale = strength === "soft" ? 0.72 : strength === "strong" ? 1.28 : 1;
  const base = style === "velocity" ? { zoom: 0.145, pan: 0.072 }
    : style === "anime" ? { zoom: 0.12, pan: 0.055 }
      : style === "glitch" ? { zoom: 0.125, pan: 0.058 }
        : style === "story" ? { zoom: 0.072, pan: 0.032 }
          : { zoom: 0.115, pan: 0.052 };
  return { zoom: base.zoom * scale, pan: base.pan * scale };
}

export type SourceAudioMode = "auto" | "keep" | "mute";

export function getSourceAudioGain(mode: SourceAudioMode, volume: number, hasMusic: boolean): number {
  if (mode === "mute") return 0;
  const safeVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
  // Automatic mode ducks original audio under music; keep mode respects the chosen level.
  return safeVolume * (mode === "auto" && hasMusic ? 0.28 : 1);
}

type SequenceOptions = {
  segments: SequenceSegment[];
  audioTracks?: AudioSegment[];
  sourceAudioMode?: SourceAudioMode;
  sourceAudioVolume?: number;
  title: string;
  aspectRatio: string;
  framingMode?: FramingMode;
  quality?: string;
  style?: SequenceRenderStyle;
  effectStrength?: "soft" | "balanced" | "strong";
  transitionMode?: "auto" | "cinematic" | "action";
  suppressEffects?: boolean;
  suppressFlashes?: boolean;
  suppressShake?: boolean;
  suppressTransitions?: boolean;
  suppressAudio?: boolean;
  targetDurationSeconds?: number;
  onProgress?: (progress: number) => void;
  onStage?: (stage: "preparing-media" | "preparing-audio" | "rendering" | "finalizing") => void;
  audioContext?: AudioContext;
};

type LoadedVideo = {
  kind: "video";
  name: string;
  video: HTMLVideoElement;
  start: number;
  end: number;
  duration: number;
  speedFactor: number;
  transitionOutSeconds?: number;
  effects?: string[];
};

type LoadedImage = {
  kind: "image";
  name: string;
  image: HTMLImageElement;
  duration: number;
  transitionOutSeconds?: number;
  effects?: string[];
};

type LoadedSegment = LoadedVideo | LoadedImage;

export type SourceFrameRect = { x: number; y: number; width: number; height: number };
export type FrameFit = "contain" | "cover";

/**
 * Compute a centered source rectangle for the requested output ratio.
 * This geometry helper never guesses where game HUD/minimap elements are; callers
 * should use contain for gameplay/UI-heavy footage unless a safe crop is known.
 */
export function getSourceFrameRect(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  fit: FrameFit = "contain",
): SourceFrameRect {
  const valid = [sourceWidth, sourceHeight, outputWidth, outputHeight].every(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (!valid) return { x: 0, y: 0, width: Math.max(1, sourceWidth || 1), height: Math.max(1, sourceHeight || 1) };

  if (fit === "contain") {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const outputAspect = outputWidth / outputHeight;
  if (sourceAspect > outputAspect) {
    const width = sourceHeight * outputAspect;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / outputAspect;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

/** Match canvas redraws to the recorder's capture rate instead of redrawing at 60–120 Hz. */
export function getRenderFrameInterval(frameRate = 24): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) return 1000 / 24;
  return 1000 / Math.min(60, Math.max(1, frameRate));
}

function waitForRenderFrame(lastFrameAt: number, intervalMs: number): Promise<number> {
  return new Promise((resolve) => {
    const check = (timestamp: number) => {
      if (timestamp - lastFrameAt >= intervalMs) resolve(timestamp);
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

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

/** Metadata guards shared by loaders and regression tests. */
export function hasUsableImageDimensions(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

export function hasUsableAudioDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0;
}

export type VideoTrimRange = { start: number; end: number; duration: number };

/** Hold the last in-range frame when a speed ramp reaches a clip's trim end early. */
export function getTrimBoundaryFrameTime(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return Number.isFinite(start) ? start : 0;
  return Math.max(start, end - Math.min(1 / 24, (end - start) / 2));
}

/**
 * Clamp a requested source-video trim to the real media duration. Tiny or
 * invalid sources cannot produce a meaningful frame sequence and are rejected
 * rather than creating a trim whose end extends past the file.
 */
export function resolveVideoTrimRange(sourceDuration: number, trimStart: number, trimEnd: number): VideoTrimRange {
  if (!Number.isFinite(sourceDuration) || sourceDuration < 0.1) {
    throw new Error("Видео слишком короткое или повреждено. Выбери исходник длительностью не менее 0,1 секунды.");
  }
  const startCandidate = Number.isFinite(trimStart) ? trimStart : 0;
  const start = Math.max(0, Math.min(startCandidate, sourceDuration - 0.1));
  const requestedEnd = Number.isFinite(trimEnd) && trimEnd > 0 ? trimEnd : sourceDuration;
  const end = Math.min(sourceDuration, Math.max(start + 0.1, Math.min(requestedEnd, sourceDuration)));
  // Normalize floating-point noise so a 0.1s minimum is not represented as 0.099999...
  const duration = Number((end - start).toFixed(6));
  return { start, end, duration };
}

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
      // A metadata event alone is not enough: malformed/unsupported files can
      // report loadedmetadata with unusable dimensions or a non-finite duration.
      // Reject them here so the montage planner never receives NaN/Infinity.
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        cleanup();
        video.pause();
        video.removeAttribute("src");
        video.load();
        reject(new Error(`У видео «${segment.name}» не удалось определить длительность. Попробуй MP4 (H.264) или другой файл.`));
        return;
      }
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        cleanup();
        video.pause();
        video.removeAttribute("src");
        video.load();
        reject(new Error(`У видео «${segment.name}» не удалось определить размер кадра. Попробуй MP4 (H.264) или другой файл.`));
        return;
      }
      cleanup();
      resolve(video);
    };
    const failed = () => {
      cleanup();
      video.pause();
      video.removeAttribute("src");
      video.load();
      reject(new Error(`Не удалось прочитать видео «${segment.name}». Попробуй MP4 (H.264) или WebM.`));
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

function loadImage(segment: ImageSegment): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finish();
      image.onload = null;
      image.onerror = null;
      image.src = "";
      reject(new Error(`Фото «${segment.name}» не загрузилось за 20 секунд. Попробуй уменьшить размер файла или выбрать другое фото.`));
    }, 20_000);
    const finish = () => {
      if (settled) return false;
      settled = true;
      window.clearTimeout(timeoutId);
      return true;
    };
    image.onload = () => {
      if (!finish()) return;
      if (!hasUsableImageDimensions(image.naturalWidth, image.naturalHeight)) {
        image.src = "";
        reject(new Error(`У фото «${segment.name}» не удалось определить размер изображения. Попробуй другое фото.`));
        return;
      }
      resolve(image);
    };
    image.onerror = () => {
      if (finish()) reject(new Error(`Не удалось прочитать фото «${segment.name}».`));
    };
    image.src = segment.url;
  });
}

function loadAudio(segment: AudioSegment): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      window.clearTimeout(timeoutId);
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("durationchange", loaded);
      audio.removeEventListener("error", failed);
      return true;
    };
    const loaded = () => {
      if (!hasUsableAudioDuration(audio.duration)) {
        if (Number.isNaN(audio.duration) || audio.duration <= 0) {
          if (finish()) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            reject(new Error(`У аудио «${segment.name}» не удалось определить длительность. Попробуй другой аудиофайл.`));
          }
        }
        // Infinity can be reported temporarily by some browsers while metadata
        // is incomplete. Wait for durationchange or the existing timeout.
        return;
      }
      if (finish()) resolve(audio);
    };
    const failed = () => {
      if (!finish()) return;
      // Release the decoder and backing URL on media errors too. Android Chrome
      // can otherwise retain failed audio elements until the whole page is closed.
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      reject(new Error(`Не удалось прочитать аудио «${segment.name}».`));
    };
    const timeoutId = window.setTimeout(() => {
      if (!finish()) return;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      reject(new Error(`Аудио «${segment.name}» не загрузилось за 20 секунд. Попробуй другой аудиофайл.`));
    }, 20_000);
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("durationchange", loaded);
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

export async function renderVideoSequence({ segments, audioTracks = [], title, aspectRatio, framingMode = "auto", quality = "720p", style = "cinematic", effectStrength = "balanced", transitionMode = "auto", suppressEffects = false, suppressFlashes = false, suppressShake = false, suppressTransitions = false, suppressAudio = false, sourceAudioMode = "auto", sourceAudioVolume = 0.8, targetDurationSeconds, onProgress, onStage, audioContext: preparedAudioContext }: SequenceOptions): Promise<Blob> {
  if (!segments.length) throw new Error("Import at least one video clip or image before rendering.");
  if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support video recording. Try a recent version of Chrome.");
  // Prefer VP8 on mobile: some Android encoders claim VP9 support but return an empty recording.
  const mimeType = chooseSupportedWebmMimeType((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("Этот браузер не поддерживает экспорт WebM. Открой DRAVEX в актуальном Chrome.");

  // Keep users informed while media metadata is being loaded before frame progress begins.
  onStage?.("preparing-media");
  // Reuse one media element per source URL. Long highlight edits may contain many trims from the same source.
  const videoCache = new Map<string, Promise<HTMLVideoElement>>();
  const segmentLoads = segments.map(async (segment): Promise<LoadedSegment> => {
    if (segment.kind === "image") {
      const image = await loadImage(segment);
      const requestedTransition = segment.transitionOutSeconds;
      const transitionOutSeconds = Number.isFinite(requestedTransition) ? Math.max(0, Math.min(2, requestedTransition as number)) : undefined;
      const effects = Array.isArray(segment.effects) ? segment.effects.filter((effect) => ["flash", "glitch-slices", "speed-lines", "vignette"].includes(effect)) : undefined;
      return { kind: "image", name: segment.name, image, duration: getSafeImageDuration(segment.duration), transitionOutSeconds, effects };
    }
    const videoSegment = segment as VideoSegment;
    let pendingVideo = videoCache.get(videoSegment.url);
    if (!pendingVideo) {
      pendingVideo = loadVideo(videoSegment);
      videoCache.set(videoSegment.url, pendingVideo);
    }
    const video = await pendingVideo;
    if (suppressAudio || sourceAudioMode === "mute") video.muted = true;
    const trim = resolveVideoTrimRange(video.duration, videoSegment.trimStart, videoSegment.trimEnd);
    const requestedSpeed = videoSegment.speedFactor;
    const speedFactor = Number.isFinite(requestedSpeed) ? Math.max(0.25, Math.min(4, requestedSpeed as number)) : 1;
    const requestedTransition = videoSegment.transitionOutSeconds;
    const transitionOutSeconds = Number.isFinite(requestedTransition) ? Math.max(0, Math.min(2, requestedTransition as number)) : undefined;
    const effects = Array.isArray(videoSegment.effects) ? videoSegment.effects.filter((effect) => ["flash", "glitch-slices", "speed-lines", "vignette"].includes(effect)) : undefined;
    return { kind: "video", name: segment.name, video, start: trim.start, end: trim.end, duration: trim.duration / speedFactor, speedFactor, transitionOutSeconds, effects };
  });
  let loaded: LoadedSegment[];
  try {
    loaded = await Promise.all(segmentLoads);
  } catch (error) {
    // Promise.all rejects as soon as one source fails, but other sources may still
    // finish decoding. Wait for them and release every successfully loaded element
    // so a failed import does not leave video decoders or image memory alive on mobile.
    const results = await Promise.allSettled(segmentLoads);
    const videos = new Set<HTMLVideoElement>();
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const item = result.value;
      if (item.kind === "video") videos.add(item.video);
      else {
        item.image.onload = null;
        item.image.onerror = null;
        item.image.src = "";
      }
    }
    for (const video of videos) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    throw error;
  }
  const sourceDuration = loaded.reduce((sum, item) => sum + item.duration, 0);
  if (sourceDuration <= 0) throw new Error("The selected trim ranges are empty.");
  // Keep every imported visual in the chosen order while fitting an overlong sequence to the target length.
  if (targetDurationSeconds && Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0) {
    if (sourceDuration > targetDurationSeconds) {
      const scale = targetDurationSeconds / sourceDuration;
      for (const item of loaded) {
        item.duration *= scale;
        if (item.kind === "video") item.end = Math.min(item.end, item.start + item.duration * item.speedFactor);
      }
    } else if (loaded.every((item) => item.kind === "image")) {
      // A still-image sequence can hold on its images to fill the requested duration, including when audio is present.
      const scale = targetDurationSeconds / sourceDuration;
      for (const item of loaded) item.duration *= scale;
    }
  }
  const totalDuration = loaded.reduce((sum, item) => sum + item.duration, 0);
  onStage?.("preparing-audio");
  const audioLoads = audioTracks.map(async (segment) => ({
    segment,
    audio: await loadAudio(segment)
  }));
  let loadedAudio: Array<{ segment: AudioSegment; audio: HTMLAudioElement }>;
  try {
    loadedAudio = await Promise.all(audioLoads);
  } catch (error) {
    // Audio setup can fail after video/image decoding has succeeded. Release both
    // completed audio elements and the already-loaded visual sources before exiting.
    const audioResults = await Promise.allSettled(audioLoads);
    for (const result of audioResults) {
      if (result.status !== "fulfilled") continue;
      result.value.audio.pause();
      result.value.audio.removeAttribute("src");
      result.value.audio.load();
    }
    const videos = new Set<HTMLVideoElement>();
    for (const item of loaded) {
      if (item.kind === "video") videos.add(item.video);
      else {
        item.image.onload = null;
        item.image.onerror = null;
        item.image.src = "";
      }
    }
    for (const video of videos) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    throw error;
  }

  // Release decoded media on every pre-recorder validation failure. On mobile,
  // detached media elements can retain decoder and memory resources until unload.
  const releaseLoadedMedia = (contextToClose?: AudioContext | null) => {
    const uniqueVideos = new Set(loaded.filter((item): item is LoadedVideo => item.kind === "video").map((item) => item.video));
    for (const video of uniqueVideos) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    for (const item of loaded) {
      if (item.kind !== "image") continue;
      item.image.onload = null;
      item.image.onerror = null;
      item.image.src = "";
    }
    for (const { audio } of loadedAudio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (contextToClose && contextToClose !== preparedAudioContext) void contextToClose.close().catch(() => {});
  };

  // Validate the actual, metadata-resolved render sequence before allocating the
  // canvas/recorder. This checks the plan the browser will really render, not
  // only the earlier user/model request.
  const timelineSources: TimelineSource[] = [];
  const videoSourceIds = new Map<HTMLVideoElement, string>();
  let timelineCursor = 0;
  const timelineClips: TimelineClip[] = loaded.map((item, index) => {
    const timelineStart = timelineCursor;
    const timelineEnd = timelineStart + item.duration;
    timelineCursor = timelineEnd;

    if (item.kind === "video") {
      let sourceId = videoSourceIds.get(item.video);
      if (!sourceId) {
        sourceId = `video-source-${videoSourceIds.size + 1}`;
        videoSourceIds.set(item.video, sourceId);
        timelineSources.push({ id: sourceId, kind: "video", duration: item.video.duration });
      }
      return {
        id: `clip-${index + 1}`,
        sourceId,
        kind: "video",
        timelineStart,
        timelineEnd,
        sourceRange: { start: item.start, end: item.end },
        playbackRate: item.speedFactor,
      };
    }

    const sourceId = `image-source-${index + 1}`;
    timelineSources.push({ id: sourceId, kind: "image" });
    return {
      id: `clip-${index + 1}`,
      sourceId,
      kind: "image",
      timelineStart,
      timelineEnd,
      playbackRate: 1,
    };
  });

  const timelineAudioTracks: TimelineAudioTrack[] = loadedAudio.map(({ audio, segment }, index) => {
    const sourceId = `audio-source-${index + 1}`;
    timelineSources.push({ id: sourceId, kind: "audio", duration: audio.duration });
    return {
      id: `audio-track-${index + 1}`,
      sourceId,
      timelineStart: 0,
      timelineEnd: totalDuration,
      sourceRange: { start: 0, end: audio.duration },
      gain: Math.max(0, Math.min(1, segment.volume ?? 0.65)),
      fadeInSeconds: Math.min(0.65, totalDuration * 0.15),
      fadeOutSeconds: Math.min(0.9, totalDuration * 0.2),
      loop: true,
    };
  });

  const timelineResolution: EditTimeline["resolution"] =
    quality === "preview" || quality === "1080p" || quality === "4K" ? quality : "720p";
  const timeline: EditTimeline = {
    schemaVersion: 1,
    targetDuration: totalDuration,
    aspectRatio: aspectRatio as EditTimeline["aspectRatio"],
    resolution: timelineResolution,
    frameRate: 24,
    clips: timelineClips,
    audioTracks: timelineAudioTracks,
  };
  const timelineValidation = validateEditTimeline(timeline, timelineSources);
  if (!timelineValidation.valid) {
    releaseLoadedMedia();
    throw new Error(`Некорректный монтажный план: ${timelineValidation.errors.join(" ")}`);
  }

  const { width, height, frameRate, videoBitsPerSecond } = getExportProfile(aspectRatio, quality);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    releaseLoadedMedia();
    throw new Error("Could not initialize the video renderer.");
  }

  const videoStream = canvas.captureStream(frameRate);
  // Do not create an AudioContext for a no-music export. On some Android
  // Chrome devices, adding an otherwise-unused Web Audio track can prevent
  // MediaRecorder from emitting video data. The no-music path records video-only.
  // Preserve source-video audio by default; when a music track is added, duck the original audio underneath it.
  const hasSourceVideo = !suppressAudio && sourceAudioMode !== "mute" && loaded.some((item) => item.kind === "video");
  const audioContext = (loadedAudio.length > 0 || hasSourceVideo) && typeof AudioContext !== "undefined" ? preparedAudioContext ?? new AudioContext() : null;
  if (hasSourceVideo && !audioContext) {
    releaseLoadedMedia();
    throw new Error("Не удалось подготовить звук исходного видео. Открой DRAVEX в актуальном Chrome и повтори экспорт.");
  }
  const audioDestination = audioContext?.createMediaStreamDestination();
  const musicGainNodes = new Map<HTMLAudioElement, GainNode>();
  const sourceVideoGainNodes = new Map<HTMLVideoElement, GainNode>();
  if (audioContext && audioDestination) {
    const connectedVideoElements = new Set<HTMLVideoElement>();
    for (const item of loaded) {
      if (item.kind !== "video" || connectedVideoElements.has(item.video)) continue;
      connectedVideoElements.add(item.video);
      const source = audioContext.createMediaElementSource(item.video);
      const sourceGain = audioContext.createGain();
      // Fade each clip's original audio at cut boundaries to reduce clicks and pops.
      sourceGain.gain.value = 0;
      source.connect(sourceGain);
      sourceGain.connect(audioDestination);
      sourceVideoGainNodes.set(item.video, sourceGain);
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
    releaseLoadedMedia(audioContext);
    throw new Error("Не удалось подготовить аудиодорожку. Открой DRAVEX в актуальном Chrome и повтори экспорт.");
  }
  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...(audioDestination?.stream.getAudioTracks() ?? [])
  ]);
  if (!stream.getVideoTracks().some((track) => track.readyState === "live")) {
    stream.getTracks().forEach((track) => track.stop());
    videoStream.getTracks().forEach((track) => track.stop());
    releaseLoadedMedia(audioContext);
    throw new Error("Не удалось запустить видеопоток с холста. Перезагрузи страницу и попробуй ещё раз.");
  }
  if (loadedAudio.length > 0 && !stream.getAudioTracks().some((track) => track.readyState === "live")) {
    stream.getTracks().forEach((track) => track.stop());
    videoStream.getTracks().forEach((track) => track.stop());
    releaseLoadedMedia(audioContext);
    throw new Error("Музыкальная дорожка не подключилась к экспорту. Музыка не будет молча пропущена — обнови страницу и попробуй ещё раз.");
  }
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  const chunks: BlobPart[] = [];
  let recorderResourcesCleaned = false;
  const cleanupRecorderResources = () => {
    if (recorderResourcesCleaned) return;
    recorderResourcesCleaned = true;
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
    if (audioContext && audioContext !== preparedAudioContext) void audioContext.close().catch(() => {});
  };
  const result = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => {
      cleanupRecorderResources();
      reject(new Error("Chrome остановил запись неожиданно. Проверь, что видео открывается в браузере, затем обнови DRAVEX и повтори экспорт. Если ошибка повторится, попробуй более короткий ролик."));
    };
    recorder.onstop = async () => {
      cleanupRecorderResources();
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

  onStage?.("rendering");
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

  const draw = (source: HTMLVideoElement | HTMLImageElement, progress = 0, cutProgress = 1, cutIndex = 0) => {
    const plannedEffects = loaded[cutIndex]?.effects;
    const effectEnabled = (effect: string, fallback: boolean) => plannedEffects === undefined ? fallback : plannedEffects.includes(effect);
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    if (!sourceWidth || !sourceHeight) return;
    const plannedTransition = cutIndex > 0 ? loaded[cutIndex - 1]?.transitionOutSeconds : undefined;
    const defaultTransitionDuration = transitionMode === "cinematic" ? 0.58 : transitionMode === "action" ? 0.3 : style === "velocity" ? 0.34 : style === "glitch" ? 0.3 : 0.42;
    const transitionDuration = plannedTransition === undefined ? defaultTransitionDuration : plannedTransition;
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
    const transitionType = transitionMode === "cinematic"
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
    const strengthScale = effectStrength === "soft" ? 0.72 : effectStrength === "strong" ? 1.28 : 1;
    const cameraMotion = getCameraMotionProfile(style, effectStrength);
    const motion = suppressEffects ? 0 : cameraMotion.zoom;
    const isPhoto = source instanceof HTMLImageElement;
    const eased = progress * progress * (3 - 2 * progress);
    const zoomDirection = cutIndex % 2 === 0 ? 1 : -1;
    const zoomBase = isPhoto ? 1.035 : 1.04;
    const zoom = zoomBase + (zoomDirection > 0 ? eased : 1 - eased) * motion;
    // Avoid destroying the subject when a landscape clip is exported as a vertical Short.
    // Use a blurred fill behind a contained foreground whenever source/output framing differs noticeably.
    const sourceAspect = sourceWidth / sourceHeight;
    const outputAspect = width / height;
    const useContain = shouldContainSource(sourceAspect, outputAspect, framingMode);
    const scale = (useContain ? Math.min(width / sourceWidth, height / sourceHeight) : Math.max(width / sourceWidth, height / sourceHeight)) * zoom;
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const panAmount = suppressEffects ? 0 : cameraMotion.pan;
    // Travel across the frame instead of easing from a static center to one side.
    // The symmetric path makes movement perceptible at the start and end of each still.
    const panPhase = eased * Math.PI;
    const pathX = [1, -1, 0.72, -0.72, 0.45, -0.45][cutIndex % 6];
    const pathY = [0, 0, -0.65, 0.65, 1, -1][cutIndex % 6];
    const panX = Math.cos(panPhase) * width * panAmount * pathX;
    const panY = Math.cos(panPhase) * height * panAmount * pathY;
    const shake = !suppressEffects && !suppressShake && cutProgress < 0.22 && style !== "story" ? (1 - cutProgress / 0.22) * (style === "velocity" ? 0.018 : 0.006) * strengthScale : 0;
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
    context.filter = suppressEffects ? "none" : getColorGradeFilter(style, effectStrength);
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
    if (!suppressEffects) {
      const shade = context.createLinearGradient(0, height * 0.6, 0, height);
      shade.addColorStop(0, "rgba(5,7,12,0)");
      shade.addColorStop(1, "rgba(5,7,12,0.18)");
      context.fillStyle = shade;
      context.fillRect(0, 0, width, height);
    }
    // A short, restrained flash and edge darkening make cuts feel deliberate without burying the footage.
    if (!suppressEffects && !suppressFlashes && effectEnabled("flash", style !== "story") && cutProgress >= 0 && cutProgress < 0.14 && style !== "story") {
      const flash = (1 - cutProgress / 0.14) * (style === "velocity" ? 0.32 : style === "glitch" ? 0.24 : style === "anime" ? 0.2 : 0.12) * strengthScale;
      context.fillStyle = `rgba(245,248,255,${flash})`;
      context.fillRect(0, 0, width, height);
    }
    if (!suppressEffects && !suppressFlashes && effectEnabled("glitch-slices", style === "glitch") && cutProgress >= 0 && cutProgress < 0.16) {
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
    if (!suppressEffects && !suppressFlashes && effectEnabled("speed-lines", style === "velocity") && cutProgress >= 0 && cutProgress < 0.28) {
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
    if (!suppressEffects && effectEnabled("vignette", true)) {
      const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.72);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, style === "story" ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.14)");
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
        const frameInterval = getRenderFrameInterval(frameRate);
        let lastFrameAt = segmentStartedAt - frameInterval;
        while (performance.now() - segmentStartedAt < item.duration * 1000) {
          lastFrameAt = await waitForRenderFrame(lastFrameAt, frameInterval);
          const elapsedSeconds = (lastFrameAt - segmentStartedAt) / 1000;
          const segmentProgress = Math.min(1, elapsedSeconds / item.duration);
          draw(item.image, segmentProgress, elapsedSeconds, cutIndex);
          onProgress?.(Math.min(99, Math.round(((completed + segmentProgress * item.duration) / totalDuration) * 100)));
        }
        savePreviousFrame();
        completed += item.duration;
        continue;
      }

      const { video, start, end, duration, speedFactor } = item;
      let trimBoundaryReached = false;
      video.pause();
      video.playbackRate = 1;
      await seek(video, start);
      const sourceGain = sourceVideoGainNodes.get(video);
      if (sourceGain && audioContext) {
        const audioNow = audioContext.currentTime;
        const fadeSeconds = Math.min(0.045, duration / 3);
        const targetGain = getSourceAudioGain(sourceAudioMode, sourceAudioVolume, loadedAudio.length > 0);
        sourceGain.gain.cancelScheduledValues(audioNow);
        sourceGain.gain.setValueAtTime(0, audioNow);
        sourceGain.gain.linearRampToValueAtTime(targetGain, audioNow + fadeSeconds);
        const fadeOutStart = audioNow + Math.max(fadeSeconds, duration - fadeSeconds);
        sourceGain.gain.setValueAtTime(targetGain, fadeOutStart);
        sourceGain.gain.linearRampToValueAtTime(0, fadeOutStart + fadeSeconds);
      }
      await video.play();
      const clipStartedAt = performance.now();
      const frameInterval = getRenderFrameInterval(frameRate);
      let lastFrameAt = clipStartedAt - frameInterval;
      while (performance.now() - clipStartedAt < duration * 1000) {
        lastFrameAt = await waitForRenderFrame(lastFrameAt, frameInterval);
        const elapsedSeconds = (lastFrameAt - clipStartedAt) / 1000;
        const clipProgress = Math.min(1, elapsedSeconds / duration);
        // Speed ramps can otherwise let the decoder run beyond the selected source trim.
        // Once the trim boundary is reached, seek back to the last in-range frame and hold it
        // for the remainder of the planned shot instead of leaking unrelated source footage.
        if (!trimBoundaryReached && video.currentTime >= end) {
          video.pause();
          try { await seek(video, getTrimBoundaryFrameTime(start, end)); } catch { /* keep the last decoded frame */ }
          trimBoundaryReached = true;
        }
        // Apply a smooth, per-style velocity curve while preserving the planned shot length.
        const rampRate = getSpeedRampRate(style, clipProgress, cutIndex);
        video.playbackRate = trimBoundaryReached ? 1 : Math.max(0.25, Math.min(4, rampRate * speedFactor));
        draw(video, clipProgress, elapsedSeconds, cutIndex);
        onProgress?.(Math.min(99, Math.round(((completed + clipProgress * duration) / totalDuration) * 100)));
      }
      // The gain automation was scheduled against the clip duration so the fade-out
      // finishes at the cut without extending the rendered timeline.
      video.pause();
      savePreviousFrame();
      completed += duration;
    }
    const last = loaded[loaded.length - 1];
    // Keep the final canvas frame alive long enough for mobile MediaRecorder implementations.
    draw(last.kind === "video" ? last.video : last.image, 1, 1, loaded.length - 1);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await new Promise((resolve) => window.setTimeout(resolve, 500));

    onStage?.("finalizing");
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

  // Android MediaRecorder can occasionally remain active without dispatching
  // the final "stop" event. Bound finalization so the UI never waits forever.
  let finalizationTimeoutId = 0;
  try {
    const blob = await Promise.race([
      result,
      new Promise<Blob>((_, reject) => {
        finalizationTimeoutId = window.setTimeout(() => {
          // Share the idempotent cleanup with recorder error/stop handlers.
          // A late "stop" event after the watchdog must not clean resources twice.
          cleanupRecorderResources();
          reject(new Error("Chrome не завершил запись ролика за 15 секунд. Монтаж не был сохранён. Обнови страницу и попробуй экспорт ещё раз; если ошибка повторится, попробуй более короткий ролик."));
        }, 15_000);
      })
    ]);
    onProgress?.(100);
    return blob;
  } finally {
    window.clearTimeout(finalizationTimeoutId);
  }
}
