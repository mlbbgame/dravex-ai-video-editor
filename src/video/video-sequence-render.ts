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

export type SequenceRenderStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story";

export type SequenceSegment = VideoSegment | ImageSegment;

type SequenceOptions = {
  segments: SequenceSegment[];
  audioTracks?: AudioSegment[];
  title: string;
  aspectRatio: string;
  quality?: string;
  style?: SequenceRenderStyle;
  suppressEffects?: boolean;
  suppressFlashes?: boolean;
  suppressShake?: boolean;
  suppressTransitions?: boolean;
  targetDurationSeconds?: number;
  onProgress?: (progress: number) => void;
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
  image: HTMLImageElement;
  duration: number;
};

type LoadedSegment = LoadedVideo | LoadedImage;

const dimensionsFor = (aspectRatio: string, quality = "720p") => {
  const multiplier = quality === "4K" ? 3 : quality === "1080p" ? 1.5 : 1;
  let base: { width: number; height: number };
  if (aspectRatio === "16:9") base = { width: 1280, height: 720 };
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
    video.src = segment.url;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error(`Could not read video: ${segment.name}`));
  });
}

function loadImage(segment: ImageSegment): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not read image: ${segment.name}`));
    image.src = segment.url;
  });
}

function loadAudio(segment: AudioSegment): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.src = segment.url;
    audio.onloadedmetadata = () => resolve(audio);
    audio.onerror = () => reject(new Error(`Could not read audio file: ${segment.name}`));
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

export async function renderVideoSequence({ segments, audioTracks = [], title, aspectRatio, quality = "720p", style = "cinematic", suppressEffects = false, suppressFlashes = false, suppressShake = false, suppressTransitions = false, targetDurationSeconds, onProgress }: SequenceOptions): Promise<Blob> {
  if (!segments.length) throw new Error("Import at least one video clip or image before rendering.");
  if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support video recording. Try a recent version of Chrome.");
  // Prefer VP8 on mobile: some Android encoders claim VP9 support but return an empty recording.
  const mimeType = ["video/webm;codecs=vp8", "video/webm", "video/webm;codecs=vp9"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("This browser does not support WebM video export.");

  // Reuse one media element per source URL. Long highlight edits may contain many trims from the same source.
  const videoCache = new Map<string, Promise<HTMLVideoElement>>();
  const loaded: LoadedSegment[] = await Promise.all(segments.map(async (segment): Promise<LoadedSegment> => {
    if (segment.kind === "image") {
      const image = await loadImage(segment);
      return { kind: "image", name: segment.name, image, duration: Math.max(1, Math.min(segment.duration ?? 3, 10)) };
    }
    const videoSegment = segment as VideoSegment;
    let pendingVideo = videoCache.get(videoSegment.url);
    if (!pendingVideo) {
      pendingVideo = loadVideo(videoSegment);
      videoCache.set(videoSegment.url, pendingVideo);
    }
    const video = await pendingVideo;
    const start = Math.max(0, Math.min(videoSegment.trimStart || 0, Math.max(0, video.duration - 0.1)));
    const requestedEnd = videoSegment.trimEnd > 0 ? videoSegment.trimEnd : video.duration;
    const end = Math.max(start + 0.1, Math.min(requestedEnd, video.duration));
    return { kind: "video", name: segment.name, video, start, end, duration: end - start };
  }));
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
  const loadedAudio = await Promise.all(audioTracks.map(async (segment) => ({
    segment,
    audio: await loadAudio(segment)
  })));

  const { width, height } = dimensionsFor(aspectRatio, quality);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not initialize the video renderer.");

  const videoStream = canvas.captureStream(24);
  const audioContext = typeof AudioContext !== "undefined" ? new AudioContext() : null;
  const audioDestination = audioContext?.createMediaStreamDestination();
  if (audioContext && audioDestination) {
    const connectedVideoElements = new Set<HTMLVideoElement>();
    for (const item of loaded) {
      if (item.kind !== "video" || connectedVideoElements.has(item.video)) continue;
      connectedVideoElements.add(item.video);
      const source = audioContext.createMediaElementSource(item.video);
      source.connect(audioDestination);
    }
    for (const item of loadedAudio) {
      const source = audioContext.createMediaElementSource(item.audio);
      const gain = audioContext.createGain();
      gain.gain.value = Math.max(0, Math.min(1, item.segment.volume ?? 0.65));
      source.connect(gain);
      gain.connect(audioDestination);
    }
  }
  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...(audioDestination?.stream.getAudioTracks() ?? [])
  ]);
  const bitrate = quality === "4K" ? 24_000_000 : quality === "1080p" ? 12_000_000 : 6_000_000;
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  const chunks: BlobPart[] = [];
  const result = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error("The browser stopped recording unexpectedly."));
    recorder.onstop = () => {
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
      void audioContext?.close();
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size) resolve(blob);
      else reject(new Error("Браузер не сохранил кадры в видеофайл. Попробуй открыть DRAVEX в Chrome, отключить музыку и создать ролик ещё раз. Если ошибка повторится, напиши, какой браузер используешь."));
    };
  });

  const draw = (source: HTMLVideoElement | HTMLImageElement, progress = 0, cutProgress = 1) => {
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    if (!sourceWidth || !sourceHeight) return;
    context.fillStyle = "#090b12";
    context.fillRect(0, 0, width, height);
    const motion = suppressEffects ? 0 : style === "velocity" ? 0.075 : style === "anime" ? 0.045 : style === "glitch" ? 0.035 : style === "story" ? 0.018 : 0.028;
    const zoom = 1.015 + Math.sin(progress * Math.PI) * motion;
    const scale = Math.max(width / sourceWidth, height / sourceHeight) * zoom;
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const shake = !suppressEffects && !suppressShake && cutProgress < 0.16 && style !== "story" ? (1 - cutProgress / 0.16) * (style === "velocity" ? 0.012 : 0.004) : 0;
    const offsetX = Math.sin(progress * 71) * width * shake;
    const offsetY = Math.cos(progress * 83) * height * shake;
    context.save();
    context.filter = suppressEffects ? "none" : style === "cinematic" ? "contrast(1.12) saturate(1.12)" : style === "anime" ? "contrast(1.1) saturate(1.25)" : style === "velocity" ? "contrast(1.16) saturate(1.22)" : style === "glitch" ? "contrast(1.18) saturate(1.3)" : "contrast(1.04) saturate(1.04)";
    // Fade each new shot in from the background so cuts feel like deliberate transitions.
    context.globalAlpha = !suppressTransitions && cutProgress >= 0 && cutProgress < 0.12
      ? Math.max(0.04, cutProgress / 0.12)
      : 1;
    context.drawImage(source, (width - drawWidth) / 2 + offsetX, (height - drawHeight) / 2 + offsetY, drawWidth, drawHeight);
    context.restore();
    if (!suppressEffects) {
      const shade = context.createLinearGradient(0, height * 0.6, 0, height);
      shade.addColorStop(0, "rgba(5,7,12,0)");
      shade.addColorStop(1, "rgba(5,7,12,0.72)");
      context.fillStyle = shade;
      context.fillRect(0, 0, width, height);
    }
    // A short, restrained flash and edge darkening make cuts feel deliberate without burying the footage.
    if (!suppressEffects && !suppressFlashes && cutProgress >= 0 && cutProgress < 0.09 && style !== "story") {
      const flash = (1 - cutProgress / 0.09) * (style === "velocity" ? 0.24 : style === "glitch" ? 0.18 : 0.1);
      context.fillStyle = `rgba(245,248,255,${flash})`;
      context.fillRect(0, 0, width, height);
    }
    if (!suppressEffects && !suppressFlashes && style === "glitch" && cutProgress >= 0 && cutProgress < 0.07) {
      context.fillStyle = `rgba(40,220,255,${(1 - cutProgress / 0.07) * 0.12})`;
      context.fillRect(0, 0, width, height);
      context.fillStyle = `rgba(255,35,100,${(1 - cutProgress / 0.07) * 0.08})`;
      context.fillRect(Math.round(width * 0.012), 0, width, height);
    }
    if (!suppressEffects) {
      const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.72);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, style === "story" ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.3)");
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
      await Promise.all(loadedAudio.map(async ({ audio }) => {
        audio.currentTime = 0;
        try {
          await audio.play();
        } catch {
          throw new Error("The browser blocked audio playback during export. Tap Create montage again and allow media playback.");
        }
      }));
    }
    for (const item of loaded) {
      if (item.kind === "image") {
        const segmentStartedAt = performance.now();
        while (performance.now() - segmentStartedAt < item.duration * 1000) {
          const segmentProgress = Math.min(1, (performance.now() - segmentStartedAt) / (item.duration * 1000));
          draw(item.image, segmentProgress, segmentProgress < 0.16 ? segmentProgress : 1);
          onProgress?.(Math.min(99, Math.round(((completed + segmentProgress * item.duration) / totalDuration) * 100)));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        completed += item.duration;
        continue;
      }

      const { video, start, duration } = item;
      video.pause();
      await seek(video, start);
      await video.play();
      const clipStartedAt = performance.now();
      while (performance.now() - clipStartedAt < duration * 1000) {
        const clipProgress = Math.min(1, (performance.now() - clipStartedAt) / (duration * 1000));
        draw(video, clipProgress, clipProgress < 0.16 ? clipProgress : 1);
        onProgress?.(Math.min(99, Math.round(((completed + clipProgress * duration) / totalDuration) * 100)));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      video.pause();
      completed += duration;
    }
    const last = loaded[loaded.length - 1];
    // Keep the final canvas frame alive long enough for mobile MediaRecorder implementations.
    draw(last.kind === "video" ? last.video : last.image);
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
