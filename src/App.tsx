import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Film, Upload, WandSparkles, Download, Music2, CheckCircle2, LoaderCircle, RefreshCw, Play, Settings2, Sparkles, Clapperboard, ScanLine, Save, FolderOpen, ArrowUp, ArrowDown, Trash2, X, Search, Headphones, ArrowLeft } from "lucide-react";
import { loadMusicTrack, musicCategories, musicPresets, type MusicPreset } from "./video/music-library";
import { analyzeVideoForHighlights, type HighlightMoment, type HighlightProgress } from "./video/highlight-finder";
import { renderVideoSequence, type SequenceRenderStyle, type VideoSegment, type ImageSegment, type AudioSegment } from "./video/video-sequence-render";
import { detectMusicBeats, snapCutBoundariesToBeats } from "./video/beat-sync";
import { loadLocalProject, saveLocalProject } from "./video/project-storage";

type EditStyle = "auto" | "velocity" | "cinematic" | "story" | "anime" | "glitch";
type Stage = "empty" | "ready" | "analyzing" | "rendering" | "done" | "error";

type TransitionPreset = "auto" | "cinematic" | "action";
type EffectPreset = "soft" | "balanced" | "strong";
type MontageVariant = {
  id: string;
  title: string;
  note: string;
  style: EditStyle;
  transition: TransitionPreset;
  strength: EffectPreset;
  previewClass: string;
  icon: typeof Sparkles;
};

type RenderedVariant = {
  id: string;
  url: string;
  title: string;
};

const montageVariants: MontageVariant[] = [
  { id: "auto", title: "Умный авто", note: "Подберём по материалу", style: "auto", transition: "auto", strength: "balanced", previewClass: "auto", icon: Sparkles },
  { id: "velocity", title: "Velocity", note: "Резко и динамично", style: "velocity", transition: "action", strength: "strong", previewClass: "velocity", icon: WandSparkles },
  { id: "cinema", title: "Cinematic", note: "Мягкое движение", style: "cinematic", transition: "cinematic", strength: "soft", previewClass: "cinema", icon: Film },
  { id: "anime", title: "Anime Impact", note: "Ярко и контрастно", style: "anime", transition: "action", strength: "strong", previewClass: "anime", icon: Sparkles },
  { id: "glitch", title: "Glitch Rush", note: "Цифровые вспышки", style: "glitch", transition: "action", strength: "strong", previewClass: "glitch", icon: ScanLine },
  { id: "story", title: "Soft Story", note: "Спокойная история", style: "story", transition: "cinematic", strength: "soft", previewClass: "story", icon: Play },
  { id: "pulse", title: "Beat Pulse", note: "Ритмичные склейки", style: "velocity", transition: "auto", strength: "balanced", previewClass: "pulse", icon: Music2 },
  { id: "neon", title: "Neon Action", note: "Неон и резкий темп", style: "glitch", transition: "auto", strength: "balanced", previewClass: "neon", icon: ScanLine },
];

function makeSegments(candidates: HighlightMoment[], sourceDuration: number, targetDuration: number, style: Exclude<EditStyle, "auto">, file: File, url: string): VideoSegment[] {
  // Match each edit style to its intended pacing: action edits cut faster than cinematic ones.
  const shotLength = style === "velocity" ? 1.05 : style === "glitch" ? 1.35 : style === "anime" ? 1.65 : style === "story" ? 3.2 : 2.2;
  const usableDuration = Math.min(sourceDuration, targetDuration);
  const count = Math.max(1, Math.ceil(usableDuration / shotLength));
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const selected: HighlightMoment[] = [];
  for (let bucket = 0; bucket < count; bucket += 1) {
    const from = sourceDuration * bucket / count;
    const to = sourceDuration * (bucket + 1) / count;
    const best = ranked.find((moment) => moment.time >= from && moment.time < to && selected.every((item) => Math.abs(item.time - moment.time) > Math.max(1.5, shotLength * 1.15)));
    if (best) selected.push(best);
  }
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (selected.every((existing) => Math.abs(existing.time - item.time) > Math.max(0.8, shotLength * 0.82))) selected.push(item);
  }
  selected.sort((a, b) => a.time - b.time);
  if (!selected.length) return [{ name: file.name, url, trimStart: 0, trimEnd: Math.min(usableDuration, sourceDuration) }];
  const segments: VideoSegment[] = [];
  let remaining = usableDuration;
  for (const moment of selected) {
    if (remaining <= 0.15) break;
    const duration = Math.min(shotLength, remaining, sourceDuration);
    const start = Math.max(0, Math.min(sourceDuration - duration, moment.time - duration / 2));
    segments.push({ name: file.name, url, trimStart: start, trimEnd: start + duration });
    remaining -= duration;
  }
  if (remaining > 0.15) {
    const step = Math.max(shotLength, sourceDuration / Math.max(1, Math.ceil(sourceDuration / shotLength)));
    for (let start = 0; remaining > 0.15; start += step) {
      const duration = Math.min(shotLength, remaining, sourceDuration);
      const safeStart = Math.max(0, Math.min(sourceDuration - duration, start % Math.max(0.1, sourceDuration - duration + 0.1)));
      segments.push({ name: file.name, url, trimStart: safeStart, trimEnd: safeStart + duration });
      remaining -= duration;
      if (segments.length > 200) break;
    }
  }
  return segments;
}

export default function App() {
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"editor" | "music">("editor");
  const [musicQuery, setMusicQuery] = useState("");
  const [musicCategory, setMusicCategory] = useState("Все");
  const [generatingMusicId, setGeneratingMusicId] = useState("");
  const [stage, setStage] = useState<Stage>("empty");
  const [duration, setDuration] = useState(30);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1" | "4:5">("9:16");
  const [style, setStyle] = useState<EditStyle>("auto");
  const [quality, setQuality] = useState<"720p" | "1080p">("720p");
  const [beatSync, setBeatSync] = useState(true);
  const [effectStrength, setEffectStrength] = useState<"soft" | "balanced" | "strong">("balanced");
  const [musicVolume, setMusicVolume] = useState(0.72);
  const [transitionMode, setTransitionMode] = useState<"auto" | "cinematic" | "action">("auto");
  const [projectMessage, setProjectMessage] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [scan, setScan] = useState<HighlightProgress>({ current: 0, total: 0, time: 0 });
  const [renderProgress, setRenderProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const [outputName, setOutputName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewStatus, setPreviewStatus] = useState("");
  const [renderedVariants, setRenderedVariants] = useState<RenderedVariant[]>([]);
  const [cutCount, setCutCount] = useState(0);
  const renderedVariantUrls = useRef<string[]>([]);
  const previewGeneration = useRef(0);
  const [usedStyle, setUsedStyle] = useState("");
  const videoInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const videoFile = mediaFiles[0] ?? null;
  const videoUrl = mediaUrls[0] ?? "";
  const isImageMode = mediaFiles.length > 0 && mediaFiles.every((file) => file.type.startsWith("image/"));
  const busy = stage === "analyzing" || stage === "rendering";

  useEffect(() => () => { mediaUrls.forEach((url) => URL.revokeObjectURL(url)); }, [mediaUrls]);

  useEffect(() => {
    let active = true;
    loadLocalProject().then((project) => {
      if (!active || !project || !project.files?.length) return;
      setMediaFiles(project.files);
      setMediaUrls(project.files.map((file) => URL.createObjectURL(file)));
      setMusicFile(project.musicFile ?? null);
      setMusicUrl(project.musicFile ? URL.createObjectURL(project.musicFile) : "");
      setStyle((project.style as EditStyle) || "auto");
      setDuration(project.duration || 30);
      setAspectRatio(project.aspectRatio ?? "9:16");
      setQuality(project.quality || "720p");
      setBeatSync(project.beatSync !== false);
      setEffectStrength(project.effectStrength ?? "balanced");
      setMusicVolume(typeof project.musicVolume === "number" ? Math.max(0, Math.min(1, project.musicVolume)) : 0.72);
      setTransitionMode(project.transitionMode ?? "auto");
      setStage("ready");
      setProjectMessage("Найден сохранённый проект на этом устройстве.");
    }).catch(() => { /* A private browser or disabled IndexedDB must not prevent editing. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => () => { if (musicUrl) URL.revokeObjectURL(musicUrl); }, [musicUrl]);
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl); }, [outputUrl]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { renderedVariantUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  const saveProject = async () => {
    if (!mediaFiles.length || projectBusy) return;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      await saveLocalProject({ files: mediaFiles, musicFile, style, duration, aspectRatio, quality, beatSync, effectStrength, musicVolume, transitionMode });
      setProjectMessage("Проект сохранён на этом устройстве вместе с исходными файлами.");
    } catch (caught) {
      setProjectMessage(caught instanceof Error ? caught.message : "Не удалось сохранить проект.");
    } finally {
      setProjectBusy(false);
    }
  };

  const restoreProject = async () => {
    if (projectBusy) return;
    setProjectBusy(true);
    try {
      const project = await loadLocalProject();
      if (!project || !project.files?.length) {
        setProjectMessage("Сохранённый проект не найден. Сначала сохрани текущий проект.");
        return;
      }
      mediaUrls.forEach((url) => URL.revokeObjectURL(url));
      if (musicUrl) URL.revokeObjectURL(musicUrl);
      clearRenderedVariants();
      setMediaFiles(project.files);
      setMediaUrls(project.files.map((file) => URL.createObjectURL(file)));
      setMusicFile(project.musicFile ?? null);
      setMusicUrl(project.musicFile ? URL.createObjectURL(project.musicFile) : "");
      setStyle((project.style as EditStyle) || "auto");
      setDuration(project.duration || 30);
      setAspectRatio(project.aspectRatio ?? "9:16");
      setQuality(project.quality || "720p");
      setBeatSync(project.beatSync !== false);
      setEffectStrength(project.effectStrength ?? "balanced");
      setMusicVolume(typeof project.musicVolume === "number" ? Math.max(0, Math.min(1, project.musicVolume)) : 0.72);
      setTransitionMode(project.transitionMode ?? "auto");
      setStage("ready");
      setOutputUrl("");
      setProjectMessage("Проект восстановлен.");
    } catch (caught) {
      setProjectMessage(caught instanceof Error ? caught.message : "Не удалось восстановить проект.");
    } finally {
      setProjectBusy(false);
    }
  };

  const onMediaSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const hasInvalid = files.some((file) => !file.type.startsWith("video/") && !file.type.startsWith("image/"));
    const videos = files.filter((file) => file.type.startsWith("video/"));
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (hasInvalid || (videos.length && (videos.length !== 1 || images.length))) {
      setError("Выбери одно видео или несколько фотографий. Видео и фото пока нужно добавлять отдельно.");
      event.target.value = "";
      return;
    }
    mediaUrls.forEach((url) => URL.revokeObjectURL(url));
    clearRenderedVariants();
    setMediaFiles(files);
    setMediaUrls(files.map((file) => URL.createObjectURL(file)));
    setOutputUrl("");
    setPreviewUrl("");
    setPreviewStatus("");
    setError("");
    setMessage("");
    setStage("ready");
    setScan({ current: 0, total: 0, time: 0 });
    event.target.value = "";
  };

  const reorderPhoto = (index: number, direction: -1 | 1) => {
    if (!isImageMode) return;
    const target = index + direction;
    if (target < 0 || target >= mediaFiles.length) return;
    const nextFiles = [...mediaFiles];
    const [moved] = nextFiles.splice(index, 1);
    nextFiles.splice(target, 0, moved);
    clearRenderedVariants();
    setMediaFiles(nextFiles);
    setMediaUrls(nextFiles.map((file) => URL.createObjectURL(file)));
    setOutputUrl("");
    setPreviewUrl("");
    setPreviewStatus("");
    setStage("ready");
    setError("");
    setMessage("");
  };

  const removePhoto = (index: number) => {
    if (!isImageMode) return;
    const nextFiles = mediaFiles.filter((_, fileIndex) => fileIndex !== index);
    clearRenderedVariants();
    setMediaFiles(nextFiles);
    setMediaUrls(nextFiles.map((file) => URL.createObjectURL(file)));
    setOutputUrl("");
    setPreviewUrl("");
    setPreviewStatus("");
    setStage(nextFiles.length ? "ready" : "empty");
    setError("");
    setMessage("");
  };

  const clearRenderedVariants = () => {
    // Any render already in progress belongs to an older set of media/settings.
    // Let it finish before starting another render, but discard its result.
    previewGeneration.current += 1;
    renderedVariantUrls.current.forEach((url) => URL.revokeObjectURL(url));
    renderedVariantUrls.current = [];
    setRenderedVariants([]);
  };

  const invalidateOutput = () => {
    setOutputUrl("");
    setPreviewUrl("");
    setPreviewStatus("");
    clearRenderedVariants();
    setError("");
    setMessage("");
    setStage(mediaFiles.length ? "ready" : "empty");
  };

  const chooseMontageVariant = (variant: MontageVariant) => {
    // Prevent a slow render of the previously selected style from replacing this selection.
    previewGeneration.current += 1;
    const hasRealPreview = renderedVariants.some((item) => item.id === variant.id);
    setStyle(variant.style);
    setTransitionMode(variant.transition);
    setEffectStrength(variant.strength);
    setOutputUrl("");
    setError("");
    setMessage("");
    setStage(mediaFiles.length ? "ready" : "empty");
    if (!hasRealPreview) clearRenderedVariants();
  };

  const clearMusic = () => {
    setMusicFile(null);
    setMusicUrl("");
    if (musicInput.current) musicInput.current.value = "";
    invalidateOutput();
  };

  const applyMusicFile = (file: File) => {
    if (!file.type.startsWith("audio/")) {
      setError("Выбери аудиофайл, который поддерживает браузер.");
      return;
    }
    setMusicFile(file);
    setMusicUrl(URL.createObjectURL(file));
    setError("");
    invalidateOutput();
  };

  const createMusicPreset = async (preset: MusicPreset) => {
    if (generatingMusicId) return;
    setGeneratingMusicId(preset.id);
    setError("");
    try {
      const file = await loadMusicTrack(preset);
      applyMusicFile(file);
      setPreviewStatus(`«${preset.title}» добавлен в монтаж. Теперь можно сразу нажать «Автомонтаж».`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать музыкальный трек.");
    } finally {
      setGeneratingMusicId("");
    }
  };

  const onMusicSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("Выбери аудиофайл, который поддерживает браузер.");
      event.target.value = "";
      return;
    }
    applyMusicFile(file);
    event.target.value = "";
  };

  const createStylePreviews = async () => {
    if (!mediaFiles.length || busy || previewBusy) return;
    const generation = previewGeneration.current;
    const pendingVariants = montageVariants.filter((variant) => !renderedVariants.some((rendered) => rendered.id === variant.id)).slice(0, 4);
    if (!pendingVariants.length) {
      setPreviewStatus("Все варианты уже созданы. Листай карточки и выбери понравившийся.");
      return;
    }
    setPreviewBusy(true);
    setPreviewProgress(0);
    setPreviewStatus(`Готовим ${pendingVariants.length} реальных вариантов по очереди — это может занять немного времени на телефоне…`);
    setError("");
    try {
      for (let index = 0; index < pendingVariants.length; index += 1) {
        if (generation !== previewGeneration.current) return;
        const variant = pendingVariants[index];
        setPreviewStatus(`Создаём вариант ${index + 1} из ${pendingVariants.length}: ${variant.title}…`);
        const previewDuration = 3.8;
        const previewStyle: Exclude<EditStyle, "auto"> = variant.style === "auto"
          ? (isImageMode && (mediaFiles.length >= 4 || (musicFile !== null && beatSync)) ? "velocity" : "cinematic")
          : variant.style;
        const previewSegments: Array<VideoSegment | ImageSegment> = isImageMode
          ? mediaFiles.slice(0, 6).map((file, segmentIndex) => ({
              kind: "image" as const,
              name: file.name,
              url: mediaUrls[segmentIndex],
              duration: previewDuration / Math.min(mediaFiles.length, 6)
            }))
          : [{ name: videoFile!.name, url: videoUrl, trimStart: 0, trimEnd: previewDuration }];
        const audioTracks: AudioSegment[] = musicUrl && musicFile
          ? [{ name: musicFile.name, url: musicUrl, volume: musicVolume }]
          : [];
        const blob = await renderVideoSequence({
          segments: previewSegments,
          audioTracks,
          title: "",
          aspectRatio,
          quality: "preview",
          style: previewStyle,
          effectStrength: variant.strength,
          transitionMode: variant.transition,
          suppressAudio: !audioTracks.length,
          targetDurationSeconds: previewDuration,
          onProgress: (progress) => {
            if (generation === previewGeneration.current) {
              setPreviewProgress(Math.round(((index + progress / 100) / pendingVariants.length) * 100));
            }
          }
        });
        if (generation !== previewGeneration.current) return;
        const url = URL.createObjectURL(blob);
        renderedVariantUrls.current.push(url);
        setRenderedVariants((current) => [...current.filter((item) => item.id !== variant.id), { id: variant.id, url, title: variant.title }]);
      }
      if (generation === previewGeneration.current) {
        setPreviewProgress(100);
        setPreviewStatus("Готово! Это реальные короткие видео с разными движением, переходами и выбранной музыкой. Листай карточки, нажимай на вариант и смотри его результат.");
      }
    } catch (caught) {
      if (generation === previewGeneration.current) {
        setError(caught instanceof Error ? caught.message : "Не удалось создать варианты. Попробуй более короткий материал.");
        setPreviewStatus("Сохранились варианты, которые успели отрендериться. Можно посмотреть их или повторить запуск.");
      }
    } finally {
      setPreviewBusy(false);
    }
  };

  const createMontage = async () => {
    if (!mediaFiles.length || busy) return;
    setError("");
    setOutputUrl("");
    setRenderProgress(0);
    setScan({ current: 0, total: 0, time: 0 });
    try {
      setStage("analyzing");
      setMessage(isImageMode ? "Анализируем темп и движение фотографий…" : "Смотрим на смену кадров и подбираем темп…");
      let segments: Array<VideoSegment | ImageSegment>;
      let renderDuration = duration;
      let sourceVideoDuration = 0;
      let actualStyle: Exclude<EditStyle, "auto"> = style === "auto" ? "cinematic" : style;
      if (isImageMode) {
        const photoCount = mediaFiles.length;
        // Auto-director treats the selected duration as a ceiling: it avoids holding a small photo set on screen for 6–10 seconds per image.
        actualStyle = style === "auto"
          ? (photoCount >= 4 || (musicFile !== null && beatSync) ? "velocity" : "cinematic")
          : actualStyle;
        const shotSeconds = actualStyle === "velocity" ? (musicFile && beatSync ? 1.25 : 1.55)
          : actualStyle === "glitch" ? 1.35
          : actualStyle === "anime" ? 1.65
          : actualStyle === "story" ? 3.1
          : 2.35;
        renderDuration = Math.min(duration, Math.max(4, photoCount * shotSeconds));
        const rhythm = actualStyle === "velocity" ? [0.72, 1.04, 1.2, 0.84, 1.1]
          : actualStyle === "glitch" ? [0.68, 1.18, 0.76, 1.25, 0.9]
          : actualStyle === "story" ? [1.12, 0.92, 1.08, 1, 0.9]
          : [0.9, 1.08, 1, 1.12, 0.9];
        const weights = mediaFiles.map((_, index) => rhythm[index % rhythm.length]);
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        segments = mediaFiles.map((file, index) => ({
          kind: "image" as const,
          name: file.name,
          url: mediaUrls[index],
          duration: renderDuration * weights[index] / totalWeight
        }));
        setScan({ current: mediaFiles.length, total: mediaFiles.length, time: 0 });
      } else {
        const analysis = await analyzeVideoForHighlights(videoUrl, setScan);
        sourceVideoDuration = analysis.duration;
        renderDuration = Math.min(duration, analysis.duration);
        if (style === "auto") {
          const averageMotion = analysis.samples.reduce((sum, sample) => sum + sample.motion, 0) / Math.max(1, analysis.samples.length);
          actualStyle = averageMotion > 0.075 ? "velocity" : "cinematic";
        }
        segments = makeSegments(analysis.candidates, analysis.duration, renderDuration, actualStyle, videoFile!, videoUrl);
      }
      if (!segments.length) throw new Error("Не удалось собрать ролик. Попробуй другой файл.");
      if (musicUrl && musicFile && beatSync) {
        setMessage("Анализируем музыкальный ритм…");
        try {
          const beatAnalysis = await detectMusicBeats(musicUrl);
          const usableBeats = beatAnalysis.beats.filter((beat) => beat > 0.05 && beat < renderDuration - 0.05);
          if (usableBeats.length >= 3 && beatAnalysis.confidence !== "weak") {
            const preferredShot = actualStyle === "velocity" ? 1.05 : actualStyle === "glitch" ? 1.35 : actualStyle === "anime" ? 1.65 : actualStyle === "story" ? 3.2 : 2.2;
            const boundaries = snapCutBoundariesToBeats(usableBeats, renderDuration, segments.length, preferredShot);
            segments = segments.map((segment, index) => {
              const nextDuration = Math.max(0.2, boundaries[index + 1] - boundaries[index]);
              if (segment.kind === "image") return { ...segment, duration: nextDuration };
              const videoSegment = segment as VideoSegment;
              const safeDuration = Math.min(nextDuration, Math.max(0.2, sourceVideoDuration));
              const center = (videoSegment.trimStart + videoSegment.trimEnd) / 2;
              const start = Math.max(0, Math.min(Math.max(0, sourceVideoDuration - safeDuration), center - safeDuration / 2));
              return { ...videoSegment, trimStart: start, trimEnd: start + safeDuration };
            });
            setMessage(`Ритм найден (${beatAnalysis.confidence === "strong" ? "высокая" : "средняя"} уверенность): монтаж подстроен под ${usableBeats.length} музыкальных акцентов.`);
          } else {
            setMessage("Ритм трека определяется ненадёжно — используем ровный монтаж, чтобы не сбить темп.");
          }
        } catch {
          setMessage("Не удалось разобрать ритм трека — продолжаем монтаж без синхронизации.");
        }
      }
      setUsedStyle(style === "auto" ? (actualStyle === "velocity" ? "Динамичный" : actualStyle === "story" ? "Спокойный" : actualStyle === "anime" ? "Аниме" : actualStyle === "glitch" ? "Глитч" : "Кинематографичный") : montageVariants.find((item) => item.style === style)?.title ?? "Автоматический");
      setCutCount(segments.length);
      setStage("rendering");
      setMessage("Собираем видео и применяем выбранный стиль…");
      const audioTracks: AudioSegment[] = musicUrl && musicFile ? [{ name: musicFile.name, url: musicUrl, volume: musicVolume }] : [];
      const blob = await renderVideoSequence({
        segments,
        audioTracks,
        title: "",
        aspectRatio,
        quality,
        style: actualStyle as SequenceRenderStyle,
        effectStrength,
        transitionMode,
        targetDurationSeconds: renderDuration,
        onProgress: setRenderProgress
      });
      const nextUrl = URL.createObjectURL(blob);
      setOutputUrl(nextUrl);
      setOutputName(`dravex-video-${Date.now()}.webm`);
      setStage("done");
      setMessage("Готово! Посмотри результат и сохрани видео.");
    } catch (caught) {
      setStage("error");
      setError(caught instanceof Error ? caught.message : "Не удалось создать видео. Попробуй более короткий ролик.");
      setMessage("");
    }
  };

  const activeVariant = montageVariants.find((variant) =>
    style === variant.style && transitionMode === variant.transition && effectStrength === variant.strength
  );
  const styleBase = montageVariants.find((variant) => variant.style === style) ?? montageVariants[0];
  const selectedVariant: MontageVariant = activeVariant ?? {
    ...styleBase,
    id: `custom-${style}-${transitionMode}-${effectStrength}`,
    title: `${styleBase.title} · свои настройки`,
    style,
    transition: transitionMode,
    strength: effectStrength
  };
  const activeRenderedVariant = renderedVariants.find((variant) => variant.id === selectedVariant.id);

  // Automatically render one short, real preview of the currently selected edit.
  // Keep this to one render at a time so mobile browsers do not run out of memory.
  const createSelectedPreview = async () => {
    if (!mediaFiles.length || busy || previewBusy) return;
    const variant = selectedVariant;
    if (renderedVariants.some((item) => item.id === variant.id)) return;

    setPreviewBusy(true);
    const generation = previewGeneration.current;
    setPreviewProgress(0);
    setPreviewStatus(`Автопросмотр: готовим стиль «${variant.title}» из твоего материала…`);
    setError("");
    try {
      const previewDuration = 3.8;
      const previewStyle: Exclude<EditStyle, "auto"> = variant.style === "auto"
        ? (isImageMode && (mediaFiles.length >= 4 || (musicFile !== null && beatSync)) ? "velocity" : "cinematic")
        : variant.style;
      let previewSegments: Array<VideoSegment | ImageSegment>;
      if (isImageMode) {
        const count = Math.min(mediaFiles.length, 6);
        const indices = Array.from({ length: count }, (_, index) =>
          count === 1 ? 0 : Math.round(index * (mediaFiles.length - 1) / (count - 1))
        );
        previewSegments = indices.map((sourceIndex) => ({
          kind: "image" as const,
          name: mediaFiles[sourceIndex].name,
          url: mediaUrls[sourceIndex],
          duration: previewDuration / count
        }));
      } else {
        previewSegments = [{ name: videoFile!.name, url: videoUrl, trimStart: 0, trimEnd: previewDuration }];
      }
      const audioTracks: AudioSegment[] = musicUrl && musicFile
        ? [{ name: musicFile.name, url: musicUrl, volume: musicVolume }]
        : [];
      const blob = await renderVideoSequence({
        segments: previewSegments,
        audioTracks,
        title: "",
        aspectRatio,
        quality: "preview",
        style: previewStyle,
        effectStrength: variant.strength,
        transitionMode: variant.transition,
        suppressAudio: !audioTracks.length,
        targetDurationSeconds: previewDuration,
        onProgress: (progress) => {
          if (generation === previewGeneration.current) setPreviewProgress(Math.round(progress));
        }
      });
      if (generation !== previewGeneration.current) return;
      const url = URL.createObjectURL(blob);
      renderedVariantUrls.current.push(url);
      setRenderedVariants((current) => [
        ...current.filter((item) => item.id !== variant.id),
        { id: variant.id, url, title: variant.title }
      ]);
      setPreviewProgress(100);
      setPreviewStatus(`Предварительный просмотр готов: «${variant.title}». Это короткий реальный фрагмент будущего монтажа. Выбери другой стиль — DRAVEX подготовит его автоматически.`);
    } catch (caught) {
      if (generation === previewGeneration.current) {
        setError(caught instanceof Error ? caught.message : "Не удалось подготовить автопросмотр. Попробуй другой материал.");
        setPreviewStatus("Автопросмотр не удался. Можно повторить вручную кнопкой ниже.");
      }
    } finally {
      // A stale render still has to release the busy lock before the next preview can start.
      setPreviewBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "editor" || !mediaFiles.length || busy || previewBusy) return;
    const selected = selectedVariant;
    if (renderedVariants.some((item) => item.id === selected.id)) return;
    const timer = window.setTimeout(() => { void createSelectedPreview(); }, 250);
    return () => window.clearTimeout(timer);
  }, [activeTab, mediaFiles, mediaUrls, style, transitionMode, effectStrength, aspectRatio, musicFile, musicUrl, musicVolume, beatSync, previewBusy, busy, stage, renderedVariants]);

  return (
    <main className="dravex-app">
      <header className="dravex-header">
        <a className="dravex-brand" href="#" aria-label="DRAVEX home"><span className="dravex-brand-mark"><Film size={21} /></span><span>DRAVEX</span></a>
        <span className="dravex-local"><span />Работает в браузере</span>
      </header>

      <nav className="dravex-tabs" aria-label="Разделы DRAVEX">
        <button type="button" className={activeTab === "editor" ? "is-active" : ""} aria-pressed={activeTab === "editor"} onClick={() => setActiveTab("editor")}><Clapperboard size={17} />Монтаж</button>
        <button type="button" className={activeTab === "music" ? "is-active" : ""} aria-pressed={activeTab === "music"} onClick={() => setActiveTab("music")}><Music2 size={17} />Музыка{musicFile && <span className="dravex-tab-dot" aria-label="Музыка выбрана" />}</button>
      </nav>

      <section className="dravex-main">
        <input ref={musicInput} className="dravex-hidden" type="file" accept="audio/*" onChange={onMusicSelected} />
        {activeTab === "music" ? (
          <div className="dravex-music-studio">
            <div className="dravex-music-hero">
              <span className="dravex-music-hero-icon"><Music2 size={25} /></span>
              <div><span className="dravex-eyebrow">DRAVEX AUDIO LAB</span><h1>Твоя музыка.<br /><span>Твой монтаж.</span></h1><p>Phonk, dark slowed, anime/gaming и динамичные биты для эдитов — добавляй трек в один тап.</p></div>
            </div>
            <div className="dravex-music-safety"><CheckCircle2 size={16} /><span>Готовые треки можно прослушать и добавить в монтаж одним нажатием. Подборка оформлена под популярные стили эдитов; все встроенные записи отмечены как CC0. Это не оригинальные коммерческие хиты из TikTok.</span></div>
            <label className="dravex-music-sync"><input type="checkbox" checked={beatSync} onChange={(event) => { setBeatSync(event.target.checked); invalidateOutput(); }} /><span><strong>Синхронизировать монтаж с битом</strong><small>DRAVEX попробует подстроить смену кадров под ритм выбранной музыки.</small></span></label>
            {musicFile && musicUrl ? <section className="dravex-current-track">
              <div className="dravex-current-track-top"><span className="dravex-track-icon"><Headphones size={19} /></span><div><strong>Выбранный трек</strong><small>{musicFile.name}</small></div><button type="button" aria-label="Убрать выбранную музыку" onClick={clearMusic}><X size={17} /></button></div>
              <audio controls preload="metadata" src={musicUrl}>Твой браузер не поддерживает аудиоплеер.</audio>
              <div className="dravex-current-track-actions"><button className="dravex-return-editor" type="button" onClick={() => setActiveTab("editor")}><ArrowLeft size={16} />Использовать в монтаже</button></div>
            </section> : <section className="dravex-music-empty"><Headphones size={22} /><div><strong>Музыка пока не выбрана</strong><span>Выбери один из готовых треков ниже или загрузи свой аудиофайл.</span></div><button type="button" onClick={() => musicInput.current?.click()}><Upload size={15} />Загрузить аудио</button></section>}
            <div className="dravex-music-heading"><div><h2>Музыкальная библиотека</h2><p>Готовые треки для эдитов, игровых моментов, экшена и cinematic-видео</p></div><span>{musicPresets.length} треков</span></div>
            <label className="dravex-music-search"><Search size={17} /><input value={musicQuery} onChange={(event) => setMusicQuery(event.target.value)} placeholder="Поиск по стилю или настроению…" aria-label="Поиск музыки" /></label>
            <div className="dravex-music-category-label">Популярные стили для эдитов</div><div className="dravex-music-categories">{musicCategories.map((category) => <button key={category} type="button" className={musicCategory === category ? "is-active" : ""} onClick={() => setMusicCategory(category)}>{category}</button>)}</div>
            <div className="dravex-track-list">{musicPresets.filter((preset) => (musicCategory === "Все" || preset.tags.includes(musicCategory) || preset.mood === musicCategory) && `${preset.title} ${preset.mood} ${preset.description} ${preset.artist}`.toLowerCase().includes(musicQuery.toLowerCase())).map((preset) => <article className="dravex-track-card" key={preset.id}>
              <span className={`dravex-track-art art-${preset.style}`}><Music2 size={21} /><span className="dravex-eq"><i /><i /><i /><i /><i /></span></span>
              <div className="dravex-track-details"><strong>{preset.title}</strong><span>{preset.description}</span><small>{preset.tags.slice(0, 2).join(" · ")} <b>·</b> {preset.artist} <b>·</b> CC0</small><audio className="dravex-track-preview" controls preload="none" crossOrigin="anonymous" src={preset.audioUrl} aria-label={`Прослушать ${preset.title}`} /><a className="dravex-track-source" href={preset.sourceUrl} target="_blank" rel="noreferrer">Автор и лицензия</a></div>
              <button type="button" disabled={Boolean(generatingMusicId)} onClick={() => void createMusicPreset(preset)}>{generatingMusicId === preset.id ? <LoaderCircle size={16} className="dravex-spin" /> : <Music2 size={16} />}{generatingMusicId === preset.id ? "Загружаем…" : "Использовать"}</button>
            </article>)}</div>
            {musicPresets.filter((preset) => (musicCategory === "Все" || preset.tags.includes(musicCategory) || preset.mood === musicCategory) && `${preset.title} ${preset.mood} ${preset.description} ${preset.tags.join(" ")}`.toLowerCase().includes(musicQuery.toLowerCase())).length === 0 && <p className="dravex-music-no-results">Ничего не найдено. Попробуй другой запрос или категорию.</p>}
            <div className="dravex-music-note"><strong>О лицензиях и популярных песнях</strong><p>Встроенные треки отмечены авторами как CC0, а «Популярные стили» — это подборка звучания для phonk/drift, anime, slowed и Shorts, не оригинальные коммерческие хиты. Для настоящих песен TikTok/CapCut нужны права или официальная лицензированная интеграция. Нажми «Использовать» — DRAVEX загрузит выбранный трек в фоне; скачивать вручную не нужно.</p></div>
            {error && <div className="dravex-error" role="alert">{error}</div>}
            {previewStatus && <p className="dravex-preview-status" role="status">{previewStatus}</p>}
          </div>
        ) : (<>
        <div className="dravex-intro"><h1>Создай видео<br /><span>автоматически</span></h1><p>Добавь материал — мы подберём монтаж под него.</p></div>
        <input ref={videoInput} className="dravex-hidden" type="file" accept="video/*,image/*" multiple onChange={onMediaSelected} />
        {!mediaFiles.length ? (
          <button className="dravex-upload" onClick={() => videoInput.current?.click()} type="button">
            <span className="dravex-upload-icon"><Upload size={25} /></span><strong>Добавить видео или фото</strong><span>Выбери материал из галереи телефона</span><small>Одно видео или несколько фотографий</small>
          </button>
        ) : (
          <div className="dravex-preview-card">
            {isImageMode ? <div className="dravex-image-grid">{mediaFiles.map((file, index) => <div className="dravex-image-thumb" key={file.name + "-" + index}>
              <img src={mediaUrls[index]} alt={file.name} />
              <div className="dravex-image-tools">
                <span title={file.name}>{index + 1}</span>
                <button type="button" aria-label={`Переместить фото ${index + 1} выше`} title="Выше" disabled={index === 0} onClick={() => reorderPhoto(index, -1)}><ArrowUp size={14} /></button>
                <button type="button" aria-label={`Переместить фото ${index + 1} ниже`} title="Ниже" disabled={index === mediaFiles.length - 1} onClick={() => reorderPhoto(index, 1)}><ArrowDown size={14} /></button>
                <button type="button" aria-label={`Удалить фото ${index + 1}`} title="Удалить фото" onClick={() => removePhoto(index)}><Trash2 size={14} /></button>
              </div>
            </div>)}</div> : <video className="dravex-preview" src={videoUrl} controls playsInline preload="metadata" />}
            <div className="dravex-file-row"><div><strong>{isImageMode ? `${mediaFiles.length} фотографий добавлено` : videoFile?.name}</strong><span>{(mediaFiles.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)} МБ</span></div><button type="button" onClick={() => videoInput.current?.click()}>Заменить</button></div>
          </div>
        )}

        <div className="dravex-section-title"><div><h2>Выбери вариант монтажа</h2><p>Листай варианты и нажми на стиль, который нравится.</p></div><Sparkles size={20} /></div>
        <div className="dravex-variant-rail" aria-label="Варианты автоматического монтажа">
          {montageVariants.map((variant) => {
            const Icon = variant.icon;
            const selected = style === variant.style;
            const rendered = renderedVariants.find((item) => item.id === variant.id);
            return <button key={variant.id} type="button" className={`dravex-variant ${selected ? "is-selected" : ""}`} onClick={() => chooseMontageVariant(variant)} aria-pressed={selected}>
              <span className={`dravex-variant-preview preview-${variant.previewClass} ${rendered ? "has-rendered" : ""}`}>
                {rendered
                  ? <video src={rendered.url} muted playsInline preload="metadata" />
                  : mediaFiles.length > 0 && isImageMode
                    ? <img src={mediaUrls[0]} alt="" loading="lazy" />
                    : mediaFiles.length > 0 && selected
                      ? <video src={videoUrl} muted playsInline loop autoPlay preload="metadata" />
                      : <span className="dravex-variant-placeholder"><Icon size={30} /><small>{mediaFiles.length ? "Создай реальный вариант" : "Твой материал"}</small></span>}
                <span className="dravex-variant-overlay" />
                <span className="dravex-variant-tag">{rendered ? "REAL VIDEO" : "STYLE IDEA"}</span>
                {selected && <span className="dravex-variant-check"><CheckCircle2 size={17} /></span>}
              </span>
              <span className="dravex-variant-copy"><strong>{variant.title}</strong><small>{variant.note}</small></span>
            </button>;
          })}
        </div>
        {activeRenderedVariant && <section className="dravex-real-preview dravex-variant-player" aria-live="polite">
          <div><strong>Сейчас выбран: {activeRenderedVariant.title}</strong><span>Это реальный результат монтажа из твоего материала. Можно посмотреть, поставить на паузу или перемотать.</span></div>
          <video key={activeRenderedVariant.id} src={activeRenderedVariant.url} controls autoPlay muted loop playsInline preload="auto" />
        </section>}
        <p className="dravex-variant-hint">После загрузки DRAVEX автоматически готовит короткий реальный автопросмотр выбранного стиля. Выбери другой стиль — его превью появится автоматически. Кнопкой ниже можно создать дополнительные варианты; они рендерятся по очереди, чтобы беречь память телефона.</p>
        <button className="dravex-preview-action" type="button" disabled={!mediaFiles.length || busy || previewBusy || renderedVariants.length === montageVariants.length} onClick={createStylePreviews}>
          {previewBusy ? <LoaderCircle className="dravex-spin" size={17} /> : <Play size={17} />}
          {previewBusy ? `Подготовка автопросмотра… ${previewProgress}%` : renderedVariants.length === montageVariants.length ? "Все варианты готовы" : `Создать дополнительные варианты (${renderedVariants.length}/${montageVariants.length})`}
        </button>
        {previewStatus && <p className="dravex-preview-status" role="status">{previewStatus}</p>}
        {renderedVariants.length > 0 && <p className="dravex-preview-status" role="status">{renderedVariants.length} из {montageVariants.length} вариантов готовы. Нажми на карточку, чтобы посмотреть её крупно и выбрать для полного монтажа.</p>}

        <details className="dravex-more">
          <summary><Settings2 size={16} />Дополнительные настройки</summary>
          <div className="dravex-more-content">
            <label className="dravex-duration dravex-duration-slider"><span>Длительность ролика <strong>{duration} сек.</strong></span><input aria-label="Длительность ролика в секундах" type="range" min={5} max={60} step={1} value={duration} onChange={(event) => { setDuration(Number(event.target.value)); invalidateOutput(); }} /><span className="dravex-range-limits"><span>5 сек.</span><span>60 сек.</span></span></label>
            <label className="dravex-duration"><span>Формат кадра</span><select value={aspectRatio} onChange={(event) => { setAspectRatio(event.target.value as "9:16" | "16:9" | "1:1" | "4:5"); invalidateOutput(); }}><option value="9:16">9:16 · TikTok / Shorts</option><option value="16:9">16:9 · YouTube</option><option value="1:1">1:1 · квадрат</option><option value="4:5">4:5 · лента</option></select></label>
            <label className="dravex-duration"><span>Качество экспорта</span><select value={quality} onChange={(event) => { setQuality(event.target.value as "720p" | "1080p"); invalidateOutput(); }}><option value="720p">720p · быстрее</option><option value="1080p">1080p · чётче</option></select></label>
            <div className="dravex-music"><span>Музыка (необязательно)</span><div className="dravex-music-actions"><button type="button" onClick={() => setActiveTab("music")}><Music2 size={16} />{musicFile ? musicFile.name : "Открыть музыкальную библиотеку"}</button>{musicFile && <button className="dravex-clear-music" type="button" aria-label="Убрать музыку" title="Убрать музыку" onClick={clearMusic}><X size={16} /></button>}</div></div>
            {musicFile && <label className="dravex-volume"><span>Громкость музыки <strong>{Math.round(musicVolume * 100)}%</strong></span><input type="range" min="0" max="100" step="5" value={Math.round(musicVolume * 100)} onChange={(event) => { setMusicVolume(Number(event.target.value) / 100); invalidateOutput(); }} /></label>}
            <label className="dravex-duration"><span>Переходы</span><select value={transitionMode} onChange={(event) => { setTransitionMode(event.target.value as "auto" | "cinematic" | "action"); invalidateOutput(); }}><option value="auto">Автоматические · разные</option><option value="cinematic">Кинематографичные · растворение</option><option value="action">Экшен · резкие движения</option></select></label>
            <label className="dravex-duration"><span>Сила движения и эффектов</span><select value={effectStrength} onChange={(event) => { setEffectStrength(event.target.value as "soft" | "balanced" | "strong"); invalidateOutput(); }}><option value="soft">Мягкая · спокойнее</option><option value="balanced">Сбалансированная</option><option value="strong">Сильная · динамичнее</option></select></label>
            <label className="dravex-duration"><span>Синхронизация ритма</span><select value={beatSync ? "on" : "off"} onChange={(event) => { setBeatSync(event.target.value === "on"); invalidateOutput(); }}><option value="on">Включена</option><option value="off">Выключена</option></select></label>
          </div>
          <div className="dravex-project-actions">
            <button type="button" onClick={saveProject} disabled={!mediaFiles.length || projectBusy}><Save size={15} />{projectBusy ? "Сохраняем…" : "Сохранить проект"}</button>
            <button type="button" onClick={restoreProject} disabled={projectBusy}><FolderOpen size={15} />Восстановить</button>
          </div>
          {projectMessage && <p className="dravex-project-message" role="status">{projectMessage}</p>}
        </details>

        <button className="dravex-create" type="button" disabled={!mediaFiles.length || busy || previewBusy} onClick={createMontage}>{busy ? <LoaderCircle className="dravex-spin" size={20} /> : <WandSparkles size={20} />}{stage === "rendering" ? "Создаём видео…" : stage === "analyzing" ? "Анализируем материал…" : "Автомонтаж"}</button>
        <p className="dravex-privacy">Обработка происходит в твоём браузере. Файлы не загружаются на наш сервер. Проекты сохраняются локально на этом устройстве.</p>

        {busy && <div className="dravex-progress"><div className="dravex-progress-top"><strong>{stage === "analyzing" ? "Анализ материала" : "Создание ролика"}</strong><span>{stage === "analyzing" ? `${getScanPercent(scan)}%` : `${renderProgress}%`}</span></div><div className="dravex-progress-track"><span style={{ width: `${stage === "analyzing" ? getScanPercent(scan) : renderProgress}%` }} /></div><p>{message}</p><small>Не закрывай вкладку во время создания видео.</small></div>}
        {error && <div className="dravex-error" role="alert">{error}</div>}
        {stage === "done" && outputUrl && <section className="dravex-result"><div className="dravex-result-title"><CheckCircle2 size={21} /><div><strong>Видео готово!</strong><span>{cutCount} фрагментов · стиль: {usedStyle} · формат WebM</span></div></div><video className="dravex-output" src={outputUrl} controls playsInline /><div className="dravex-result-actions"><a href={outputUrl} download={outputName}><Download size={17} />Сохранить видео</a><button type="button" onClick={createMontage}><RefreshCw size={16} />Создать ещё</button></div></section>}
        </>)}
      </section>

      <footer className="dravex-footer"><Clapperboard size={15} />DRAVEX <span>·</span> Просто создавай</footer>
    </main>
  );
}

function getScanPercent(scan: HighlightProgress) {
  return scan.total ? Math.round((scan.current / scan.total) * 100) : 0;
}
