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

export type SequenceSegment = VideoSegment | ImageSegment;

type SequenceOptions = {
  segments: SequenceSegment[];
  title: string;
  aspectRatio: string;
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

const dimensionsFor = (aspectRatio: string) => {
  if (aspectRatio === "16:9") return { width: 1280, height: 720 };
  if (aspectRatio === "1:1") return { width: 720, height: 720 };
  if (aspectRatio === "4:5") return { width: 720, height: 900 };
  return { width: 720, height: 1280 };
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

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.01) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { video.removeEventListener("error", failed); resolve(); };
    const failed = () => { video.removeEventListener("seeked", done); reject(new Error("Could not seek within one of the selected clips.")); };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = time;
  });
}

export async function renderVideoSequence({ segments, title, aspectRatio, onProgress }: SequenceOptions): Promise<Blob> {
  if (!segments.length) throw new Error("Import at least one video clip or image before rendering.");
  if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support video recording. Try a recent version of Chrome.");
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("This browser does not support WebM video export.");

  const loaded: LoadedSegment[] = await Promise.all(segments.map(async (segment): Promise<LoadedSegment> => {
    if (segment.kind === "image") {
      const image = await loadImage(segment);
      return { kind: "image", name: segment.name, image, duration: Math.max(1, Math.min(segment.duration ?? 3, 10)) };
    }
    const videoSegment = segment as VideoSegment;
    const video = await loadVideo(videoSegment);
    const start = Math.max(0, Math.min(videoSegment.trimStart || 0, Math.max(0, video.duration - 0.1)));
    const requestedEnd = videoSegment.trimEnd > 0 ? videoSegment.trimEnd : video.duration;
    const end = Math.max(start + 0.1, Math.min(requestedEnd, video.duration));
    return { kind: "video", name: segment.name, video, start, end, duration: end - start };
  }));
  const totalDuration = loaded.reduce((sum, item) => sum + item.duration, 0);
  if (totalDuration <= 0) throw new Error("The selected trim ranges are empty.");

  const { width, height } = dimensionsFor(aspectRatio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not initialize the video renderer.");

  const videoStream = canvas.captureStream(24);
  const audioContext = typeof AudioContext !== "undefined" ? new AudioContext() : null;
  const audioDestination = audioContext?.createMediaStreamDestination();
  if (audioContext && audioDestination) {
    for (const item of loaded) {
      if (item.kind !== "video") continue;
      const source = audioContext.createMediaElementSource(item.video);
      source.connect(audioDestination);
    }
  }
  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...(audioDestination?.stream.getAudioTracks() ?? [])
  ]);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  const result = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error("The browser stopped recording unexpectedly."));
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      videoStream.getTracks().forEach((track) => track.stop());
      loaded.forEach((item) => {
        if (item.kind === "video") {
          item.video.pause();
          item.video.removeAttribute("src");
          item.video.load();
        }
      });
      void audioContext?.close();
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size) resolve(blob);
      else reject(new Error("The rendered video was empty. Please try again."));
    };
  });

  const draw = (source: HTMLVideoElement | HTMLImageElement) => {
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    context.fillStyle = "#090b12";
    context.fillRect(0, 0, width, height);
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    const shade = context.createLinearGradient(0, height * 0.6, 0, height);
    shade.addColorStop(0, "rgba(5,7,12,0)");
    shade.addColorStop(1, "rgba(5,7,12,0.72)");
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);
    const cleanTitle = title.trim().slice(0, 90);
    if (cleanTitle) {
      context.font = `700 ${Math.max(24, Math.round(width * 0.045))}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.fillStyle = "#fff";
      context.shadowColor = "rgba(0,0,0,0.65)";
      context.shadowBlur = 8;
      context.fillText(cleanTitle, width / 2, height * 0.91, width * 0.86);
      context.shadowBlur = 0;
    }
  };

  if (audioContext?.state === "suspended") await audioContext.resume();
  recorder.start(250);
  let completed = 0;
  try {
    for (const item of loaded) {
      if (item.kind === "image") {
        const segmentStartedAt = performance.now();
        while (performance.now() - segmentStartedAt < item.duration * 1000) {
          draw(item.image);
          const segmentProgress = Math.min(1, (performance.now() - segmentStartedAt) / (item.duration * 1000));
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
        draw(video);
        const clipProgress = Math.min(1, (performance.now() - clipStartedAt) / (duration * 1000));
        onProgress?.(Math.min(99, Math.round(((completed + clipProgress * duration) / totalDuration) * 100)));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      video.pause();
      completed += duration;
    }
    const last = loaded[loaded.length - 1];
    draw(last.kind === "video" ? last.video : last.image);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    recorder.stop();
  } catch (error) {
    if (recorder.state !== "inactive") recorder.stop();
    throw error;
  }

  const blob = await result;
  onProgress?.(100);
  return blob;
}
