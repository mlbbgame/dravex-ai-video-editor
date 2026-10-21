import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Film, Upload, WandSparkles, Download, Music2, CheckCircle2, LoaderCircle, RefreshCw, Play, Settings2, Sparkles, Clapperboard, Save, FolderOpen, ArrowUp, ArrowDown, Trash2, X, Search, Headphones, ArrowLeft } from "lucide-react";
import { loadMusicTrack, musicCategories, musicPresets, type MusicPreset } from "./video/music-library";
import { analyzeVideoForHighlights, getVideoDuration, type HighlightMoment, type HighlightProgress } from "./video/highlight-finder";
import type { SemanticProfile } from "./video/semantic-classifier";
import { analyzeWithAIDirector } from "./video/ai-director";
import { prepareAudioContextForUserGesture, renderVideoSequence, type SequenceRenderStyle, type VideoSegment, type ImageSegment, type AudioSegment } from "./video/video-sequence-render";
import { detectMusicBeats, snapCutBoundariesToBeats } from "./video/beat-sync";
import { clearSessionProject, loadLocalProject, loadSessionProject, saveLocalProject, saveSessionProject } from "./video/project-storage";
import { getMediaKind } from "./video/media-kind";
import { assessMediaSelection } from "./video/media-intake";
import { buildFallbackVideoCuts } from "./video/segment-planner";
import { selectDiverseHighlightMoments } from "./video/montage-selection";
import { analyzePhotoSet } from "./video/photo-analysis";
import { inspectRenderedVideo, type OutputQualityReport } from "./video/output-quality";
import { planVariantPreviewCuts, selectVariantPreviewIndices } from "./video/variant-preview";

type EditStyle = "auto" | "velocity" | "cinematic" | "story" | "anime" | "glitch";
type Stage = "empty" | "ready" | "analyzing" | "rendering" | "done" | "error";

type TransitionPreset = "auto" | "cinematic" | "action";
type EffectPreset = "soft" | "balanced" | "strong";
type FramingMode = "auto" | "fit" | "fill";
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
  { id: "velocity", title: "Агрессивный", note: "Быстрые склейки и сильный импакт", style: "velocity", transition: "action", strength: "strong", previewClass: "velocity", icon: WandSparkles },
  { id: "cinema", title: "Кинематографичный", note: "Плавный темп и мягкие переходы", style: "cinematic", transition: "cinematic", strength: "soft", previewClass: "cinema", icon: Film },
  { id: "pulse", title: "Динамичный под музыку", note: "Ритмичный монтаж с выбранным треком", style: "velocity", transition: "auto", strength: "balanced", previewClass: "pulse", icon: Music2 },
  { id: "story", title: "История / атмосферный", note: "Спокойный ритм для природы, еды и путешествий", style: "story", transition: "cinematic", strength: "soft", previewClass: "story", icon: Clapperboard },
];

function styleForSemanticProfile(profile: SemanticProfile | undefined, fallback: Exclude<EditStyle, "auto">): Exclude<EditStyle, "auto"> {
  switch (profile) {
    case "automotive": return "velocity";
    // Action-heavy sports and outdoor activities benefit from tighter pacing.
    case "sports": return "velocity";
    case "nature":
    case "food":
    case "wildlife": return "cinematic";
    case "people": return "story";
    case "product-diy": return "cinematic";
    case "anime": return "anime";
    // Gameplay benefits from energetic pacing, while crop safety is handled separately.
    case "gaming": return "velocity";
    default: return fallback;
  }
}

function makeSegments(candidates: HighlightMoment[], sourceDuration: number, targetDuration: number, style: Exclude<EditStyle, "auto">, file: File, url: string): VideoSegment[] {
  // Match each edit style to its intended pacing: action edits cut faster than cinematic ones.
  const shotLength = style === "velocity" ? 1.05 : style === "glitch" ? 1.35 : style === "anime" ? 1.65 : style === "story" ? 3.2 : 2.2;
  const usableDuration = Math.min(sourceDuration, targetDuration);
  const count = Math.max(1, Math.ceil(usableDuration / shotLength));
  const selected = selectDiverseHighlightMoments(candidates, count, sourceDuration, style, shotLength);

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

async function alignPreviewSegmentsToMusic(
  segments: Array<VideoSegment | ImageSegment>,
  variantId: string,
  previewDuration: number,
  sourceDuration: number,
  musicUrl: string,
  beatSyncEnabled: boolean
): Promise<Array<VideoSegment | ImageSegment>> {
  if (variantId !== "pulse" || !beatSyncEnabled || !musicUrl || segments.length < 2
    || sourceDuration < previewDuration) return segments;
  try {
    const analysis = await detectMusicBeats(musicUrl);
    const beats = analysis.beats.filter((beat) => beat > 0.05 && beat < previewDuration - 0.05);
    if (beats.length < 3 || analysis.confidence === "weak") return segments;
    const boundaries = snapCutBoundariesToBeats(beats, previewDuration, segments.length, 0.95);
    return segments.map((segment, index) => {
      const nextDuration = Math.max(0.2, boundaries[index + 1] - boundaries[index]);
      if (segment.kind === "image") return { ...segment, duration: nextDuration };
      const videoSegment = segment as VideoSegment;
      const safeDuration = Math.min(nextDuration, sourceDuration);
      const center = (videoSegment.trimStart + videoSegment.trimEnd) / 2;
      const trimStart = Math.max(0, Math.min(sourceDuration - safeDuration, center - safeDuration / 2));
      return { ...videoSegment, trimStart, trimEnd: trimStart + safeDuration };
    });
  } catch {
    // Beat analysis is an enhancement, not a reason to block a preview.
    return segments;
  }
}

export default function App() {
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [videoPreviewStatus, setVideoPreviewStatus] = useState<"loading" | "ready" | "unsupported" | "error">("loading");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"editor" | "music">("editor");
  const [musicQuery, setMusicQuery] = useState("");
  const [musicCategory, setMusicCategory] = useState("Все");
  const [generatingMusicId, setGeneratingMusicId] = useState("");
  const [stage, setStage] = useState<Stage>("empty");
  const [duration, setDuration] = useState(30);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1" | "4:5">("9:16");
  const [framingMode, setFramingMode] = useState<FramingMode>("auto");
  const [style, setStyle] = useState<EditStyle>("auto");
  const [quality, setQuality] = useState<"720p" | "1080p" | "4K">("720p");
  const [qualityReport, setQualityReport] = useState<OutputQualityReport | null>(null);
  const [qualityCheckBusy, setQualityCheckBusy] = useState(false);
  const [beatSync, setBeatSync] = useState(true);
  const [effectStrength, setEffectStrength] = useState<"soft" | "balanced" | "strong">("balanced");
  const [musicVolume, setMusicVolume] = useState(0.72);
  const [transitionMode, setTransitionMode] = useState<"auto" | "cinematic" | "action">("auto");
  const [projectMessage, setProjectMessage] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectHydrated, setProjectHydrated] = useState(false);
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
  const autoPreviewAttempt = useRef(-1);
  const [usedStyle, setUsedStyle] = useState("");
  const videoInput = useRef<HTMLInputElement>(null);
  const mediaSelectionMode = useRef<"replace" | "add">("replace");
  const musicInput = useRef<HTMLInputElement>(null);
  const videoFile = mediaFiles[0] ?? null;
  const videoUrl = mediaUrls[0] ?? "";
  const isImageMode = mediaFiles.length > 0 && mediaFiles.every((file) => getMediaKind(file) === "image");
  const busy = stage === "analyzing" || stage === "rendering";

  useEffect(() => () => { mediaUrls.forEach((url) => URL.revokeObjectURL(url)); }, [mediaUrls]);

  // Restore the active project only within the same tab session; a fresh session starts clean.
  useEffect(() => () => { if (musicUrl) URL.revokeObjectURL(musicUrl); }, [musicUrl]);
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl); }, [outputUrl]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { renderedVariantUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  // Keep a project during the current tab session (including refreshes), but
  // start from a clean editor when the site is opened in a fresh tab session.
  // sessionStorage survives reloads and is cleared when the tab is closed.
  useEffect(() => {
    let cancelled = false;
    const sessionKey = "dravex-active-editor-session-v1";
    let isFreshSession = false;
    try {
      isFreshSession = !window.sessionStorage.getItem(sessionKey);
    } catch {
      // If session storage is blocked, prefer a clean editor rather than restoring stale media.
      isFreshSession = true;
    }

    const projectPromise = isFreshSession
      ? clearSessionProject().then(() => {
          // Mark the tab active only after stale project data is definitely cleared.
          // If the page reloads while clearing, the next load will safely clear again.
          try { window.sessionStorage.setItem(sessionKey, "active"); } catch { /* best effort */ }
          return null;
        })
      : loadSessionProject();

    void projectPromise.then((project) => {
      if (cancelled) return;
      if (project?.files?.length) {
        setMediaFiles(project.files);
        setMediaUrls(project.files.map((file) => URL.createObjectURL(file)));
        setActivePhotoIndex(0);
        setMusicFile(project.musicFile ?? null);
        setMusicUrl(project.musicFile ? URL.createObjectURL(project.musicFile) : "");
        setStyle((project.style as EditStyle) || "auto");
        setDuration(project.duration || 30);
        setAspectRatio(project.aspectRatio ?? "9:16");
        setFramingMode(project.framingMode ?? "auto");
        setQuality(project.quality || "720p");
        setBeatSync(project.beatSync !== false);
        setEffectStrength(project.effectStrength ?? "balanced");
        setMusicVolume(typeof project.musicVolume === "number" ? Math.max(0, Math.min(1, project.musicVolume)) : 0.72);
        setTransitionMode(project.transitionMode ?? "auto");
        setStage("ready");
        setProjectMessage("Проект восстановлен в рамках текущего сеанса.");
      }
    }).catch(() => {
      // Keep the editor usable even if this browser blocks local storage.
    }).finally(() => {
      if (!cancelled) setProjectHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Save changes quietly during this tab session. A fresh session clears this copy.
  useEffect(() => {
    if (!projectHydrated) return;
    const timeout = window.setTimeout(() => {
      void saveSessionProject({
        files: mediaFiles,
        musicFile,
        style,
        duration,
        aspectRatio,
        framingMode,
        quality,
        beatSync,
        effectStrength,
        musicVolume,
        transitionMode,
      }).catch(() => {
        // Manual save still reports storage errors to the user.
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [projectHydrated, mediaFiles, musicFile, style, duration, aspectRatio, quality, beatSync, effectStrength, musicVolume, transitionMode, framingMode]);

  // On Android, the system/browser Back action should leave the Music tab first,
  // returning to the existing edit instead of navigating away and losing context.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  useEffect(() => {
    window.history.pushState({ dravexTab: "editor" }, "", window.location.href);
    const handlePopState = () => {
      if (activeTabRef.current === "music") {
        setActiveTab("editor");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    if (activeTab === "music") {
      window.history.pushState({ dravexTab: "music" }, "", window.location.href);
    }
  }, [activeTab]);

  const clearEditor = () => {
    if (busy || previewBusy || projectBusy) return;
    if (!window.confirm("Очистить текущий проект? Исходные файлы и настройки редактора будут убраны из рабочего пространства.")) return;
    mediaUrls.forEach((url) => URL.revokeObjectURL(url));
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    clearRenderedVariants();
    setMediaFiles([]);
    setMediaUrls([]);
    setActivePhotoIndex(0);
    setMusicFile(null);
    setMusicUrl("");
    setStyle("auto");
    setDuration(30);
    setAspectRatio("9:16");
    setFramingMode("auto");
    setQuality("720p");
    setBeatSync(true);
    setEffectStrength("balanced");
    setMusicVolume(0.72);
    setTransitionMode("auto");
    setStage("empty");
    setScan({ current: 0, total: 0, time: 0 });
    setRenderProgress(0);
    setMessage("");
    setError("");
    setOutputUrl("");
    setOutputName("");
    setQualityReport(null);
    setQualityCheckBusy(false);
    setPreviewUrl("");
    setPreviewBusy(false);
    setPreviewProgress(0);
    setPreviewStatus("");
    setCutCount(0);
    setUsedStyle("");
    setProjectMessage("Редактор очищен. Сохранённый проект можно открыть вручную.");
  };

  const saveProject = async () => {
    if (!mediaFiles.length || projectBusy) return;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      await saveLocalProject({ files: mediaFiles, musicFile, style, duration, aspectRatio, quality, beatSync, effectStrength, musicVolume, transitionMode, framingMode });
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
      setActivePhotoIndex(0);
      setMusicFile(project.musicFile ?? null);
      setMusicUrl(project.musicFile ? URL.createObjectURL(project.musicFile) : "");
      setStyle((project.style as EditStyle) || "auto");
      setDuration(project.duration || 30);
      setAspectRatio(project.aspectRatio ?? "9:16");
      setFramingMode(project.framingMode ?? "auto");
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
    const selectionMode = mediaSelectionMode.current;
    mediaSelectionMode.current = "replace";
    // Reset immediately so choosing the same file again still fires a change event.
    event.target.value = "";
    if (!files.length) return;
    const hasInvalid = files.some((file) => getMediaKind(file) === "unknown");
    const videos = files.filter((file) => getMediaKind(file) === "video");
    const images = files.filter((file) => getMediaKind(file) === "image");
    if (hasInvalid) {
      setError("Не удалось определить формат одного из файлов. Выбери видео MP4, WebM или MOV либо фотографии JPG, PNG или WebP.");
      return;
    }
    if (videos.length && (videos.length !== 1 || images.length)) {
      setError("Сейчас можно добавить одно видео за раз или подборку фотографий. Смешивание видео с фото и несколько видео в одном проекте пока не поддерживаются.");
      return;
    }

    const appendPhotos = selectionMode === "add" && mediaFiles.length > 0 && isImageMode && images.length === files.length;
    if (selectionMode === "add" && !appendPhotos) {
      setError("К фотоподборке можно добавлять только фотографии. Чтобы заменить материал, нажми «Заменить».");
      return;
    }

    let nextFiles = files;
    let newFiles = files;
    if (appendPhotos) {
      const knownKeys = new Set(mediaFiles.map((file) => `${file.name}|${file.size}|${file.lastModified}`));
      newFiles = images.filter((file) => {
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        if (knownKeys.has(key)) return false;
        knownKeys.add(key);
        return true;
      });
      if (!newFiles.length) {
        setError("Эти фотографии уже добавлены в медиатеку.");
        return;
      }
      nextFiles = [...mediaFiles, ...newFiles];
    }

    const intake = assessMediaSelection(nextFiles);
    if (!intake.valid) {
      setError(intake.errors.join(" "));
      return;
    }

    clearRenderedVariants();
    if (appendPhotos) {
      setMediaFiles(nextFiles);
      // The previous URL list is revoked by the mediaUrls effect cleanup, so recreate URLs for all retained photos.
      setMediaUrls(nextFiles.map((file) => URL.createObjectURL(file)));
      setActivePhotoIndex(mediaFiles.length);
    } else {
      mediaUrls.forEach((url) => URL.revokeObjectURL(url));
      setMediaFiles(nextFiles);
      setMediaUrls(nextFiles.map((file) => URL.createObjectURL(file)));
      setActivePhotoIndex(0);
    }
    setOutputUrl("");
    setPreviewUrl("");
    setPreviewStatus("");
    setError("");
    setPreviewStatus(intake.warnings.join(" "));
    setStage("ready");
    setVideoPreviewStatus("loading");
    setScan({ current: 0, total: 0, time: 0 });
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
    setActivePhotoIndex(target);
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
    setActivePhotoIndex(0);
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
    setQualityReport(null);
    setQualityCheckBusy(false);
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
    const pendingVariants = montageVariants.filter((variant) => !renderedVariants.some((rendered) => rendered.id === variant.id));
    if (!pendingVariants.length) {
      setPreviewStatus("Все четыре варианта готовы. Выбери лучший и запусти полный монтаж.");
      return;
    }
    setPreviewBusy(true);
    setPreviewProgress(0);
    setPreviewStatus(`Готовим ${pendingVariants.length} варианта по очереди, чтобы не перегружать память телефона…`);
    setError("");
    try {
      const requestedPreviewDuration = 3.8;
      const sourceDuration = isImageMode ? requestedPreviewDuration : await getVideoDuration(videoUrl);
      for (let index = 0; index < pendingVariants.length; index += 1) {
        if (generation !== previewGeneration.current) return;
        const variant = pendingVariants[index];
        setPreviewStatus(`Создаём вариант ${index + 1} из ${pendingVariants.length}: ${variant.title}…`);
        const previewStyle: Exclude<EditStyle, "auto"> = variant.style === "auto"
          ? (isImageMode && (mediaFiles.length >= 4 || (musicFile !== null && beatSync)) ? "velocity" : "cinematic")
          : variant.style;
        let previewDuration = requestedPreviewDuration;
        let previewSegments: Array<VideoSegment | ImageSegment>;
        if (isImageMode) {
          const indices = selectVariantPreviewIndices(mediaFiles.length, variant.id);
          previewSegments = indices.map((sourceIndex) => ({
            kind: "image" as const,
            name: mediaFiles[sourceIndex].name,
            url: mediaUrls[sourceIndex],
            duration: requestedPreviewDuration / Math.max(1, indices.length)
          }));
        } else {
          const plan = planVariantPreviewCuts(sourceDuration, requestedPreviewDuration, variant.id);
          previewDuration = plan.duration;
          previewSegments = plan.cuts.map((cut) => ({
            name: videoFile!.name,
            url: videoUrl,
            trimStart: cut.trimStart,
            trimEnd: cut.trimEnd
          }));
        }
        previewSegments = await alignPreviewSegmentsToMusic(
          previewSegments, variant.id, previewDuration, sourceDuration, musicUrl, beatSync && Boolean(musicFile)
        );
        const audioTracks: AudioSegment[] = musicUrl && musicFile
          ? [{ name: musicFile.name, url: musicUrl, volume: musicVolume }]
          : [];
        const blob = await renderVideoSequence({
          segments: previewSegments,
          audioTracks,
          title: "",
          aspectRatio,
          framingMode,
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
        setPreviewStatus("Готово! Сравни четыре коротких видео: агрессивное, кинематографичное, динамичное под музыку и атмосферное. Выбери карточку для просмотра.");
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
    // Unlock Web Audio immediately during the tap, before long source-video analysis
    // can outlive the browser's transient user activation.
    let preparedAudioContext: AudioContext | undefined;
    if (!isImageMode || (musicUrl && musicFile)) {
      preparedAudioContext = prepareAudioContextForUserGesture() ?? undefined;
    }
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
      let analysisFallback = false;
      let directorNote = "";
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
        const photoAnalysis = await analyzePhotoSet(mediaUrls);
        const weights = mediaFiles.map((_, index) =>
          rhythm[index % rhythm.length] * (photoAnalysis.weights[index] ?? 1)
        );
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        setMessage("Фото оценены по освещению, контрасту, деталям и сходству соседних кадров; порядок снимков сохранён.");
        segments = mediaFiles.map((file, index) => ({
          kind: "image" as const,
          name: file.name,
          url: mediaUrls[index],
          duration: renderDuration * weights[index] / totalWeight
        }));
        setScan({ current: mediaFiles.length, total: mediaFiles.length, time: 0 });
      } else {
        try {
          const analysis = await analyzeVideoForHighlights(videoUrl, (progress) => {
            setScan({ current: progress.current, total: progress.total, time: progress.time });
            if (progress.phase === "semantic") setMessage("AI Director: определяем тип сцены; если модель недоступна, продолжим по движению и композиции…");
          });
          sourceVideoDuration = analysis.duration;
          renderDuration = Math.min(duration, analysis.duration);
          if (style === "auto") {
            const averageMotion = analysis.samples.reduce((sum, sample) => sum + sample.motion, 0) / Math.max(1, analysis.samples.length);
            const motionStyle = averageMotion > 0.075 ? "velocity" : "cinematic";
            actualStyle = analysis.semantic?.profile && analysis.semantic.profile !== "unknown"
              ? styleForSemanticProfile(analysis.semantic.profile, motionStyle)
              : motionStyle;
          }
          setMessage("AI Director: загружаем модель распознавания объектов и анализируем сцены…");
          const directorResult = await analyzeWithAIDirector(
            videoUrl,
            analysis.duration,
            analysis.samples,
            analysis.candidates,
            actualStyle,
            (progress) => {
              setScan({ current: progress.current, total: progress.total, time: 0 });
              if (progress.phase === "loading-model") {
                setMessage("AI Director: загружаем модель распознавания объектов…");
              } else if (progress.phase === "reading-frames") {
                setMessage(`AI Director: анализируем кадры ${progress.current} из ${progress.total}…`);
              } else {
                setMessage("AI Director: ранжируем фрагменты под выбранный стиль…");
              }
            },
            style === "auto"
          );
          actualStyle = directorResult.selectedStyle;
          directorNote = directorResult.note;
          segments = makeSegments(directorResult.candidates, analysis.duration, renderDuration, actualStyle, videoFile!, videoUrl);
          setMessage(directorNote);
        } catch (analysisError) {
          // A failed frame scan should not block a usable video export when metadata is readable.
          sourceVideoDuration = await getVideoDuration(videoUrl);
          renderDuration = Math.min(duration, sourceVideoDuration);
          if (style === "auto") actualStyle = "cinematic";
          const shotLength = actualStyle === "velocity" ? 1.05
            : actualStyle === "glitch" ? 1.35
            : actualStyle === "anime" ? 1.65
            : actualStyle === "story" ? 3.2
            : 2.2;
          const fallbackCuts = buildFallbackVideoCuts(sourceVideoDuration, renderDuration, shotLength);
          segments = fallbackCuts.map((cut) => ({
            name: videoFile!.name,
            url: videoUrl,
            trimStart: cut.trimStart,
            trimEnd: cut.trimEnd
          }));
          analysisFallback = true;
          setMessage("Не удалось разобрать отдельные кадры — собираем равномерный монтаж из исходного видео.");
          if (analysisError instanceof Error) console.warn("DRAVEX highlight scan fallback:", analysisError.message);
        }
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
      setMessage(analysisFallback ? "Анализ кадров недоступен — собираем равномерный монтаж…" : "Собираем видео и применяем выбранный стиль…");
      const audioTracks: AudioSegment[] = musicUrl && musicFile ? [{ name: musicFile.name, url: musicUrl, volume: musicVolume }] : [];
      const blob = await renderVideoSequence({
        segments,
        audioTracks,
        title: "",
        aspectRatio,
        framingMode,
        quality,
        style: actualStyle as SequenceRenderStyle,
        effectStrength,
        transitionMode,
        targetDurationSeconds: renderDuration,
        onProgress: setRenderProgress,
        audioContext: preparedAudioContext
      });
      const nextUrl = URL.createObjectURL(blob);
      setOutputUrl(nextUrl);
      setOutputName(`dravex-video-${Date.now()}.webm`);
      setQualityReport(null);
      setQualityCheckBusy(true);
      setStage("done");
      // Inspect the encoded WebM without blocking playback or download. The check is advisory.
      void inspectRenderedVideo(blob).then((report) => {
        setQualityReport(report);
      }).catch((qualityError) => {
        console.warn("DRAVEX output quality check failed:", qualityError);
        setQualityReport({ frames: [], duration: 0, width: 0, height: 0, sampledFrames: 0, blackFrameTimes: [], frozenFramePairs: [], findings: ["Не удалось автоматически проверить кадры. Открой видео в плеере и проверь воспроизведение вручную."], severity: "warning" });
      }).finally(() => setQualityCheckBusy(false));
      setMessage(analysisFallback ? "Готово! Анализ кадров был недоступен, поэтому использован равномерный монтаж. Посмотри результат и сохрани видео." : `Готово! ${directorNote ? `${directorNote} ` : ""}Посмотри результат и сохрани видео.`);
    } catch (caught) {
      setStage("error");
      setError(caught instanceof Error ? caught.message : "Не удалось создать видео. Попробуй более короткий ролик.");
      setMessage("");
    } finally {
      if (preparedAudioContext && preparedAudioContext.state !== "closed") {
        void preparedAudioContext.close().catch(() => {});
      }
    }
  };

  const activeVariant = montageVariants.find((variant) =>
    style === variant.style && transitionMode === variant.transition && effectStrength === variant.strength
  );
  const styleBase = montageVariants.find((variant) => variant.style === style) ?? montageVariants[0];
  // "Умный авто" is a montage mode, not one of the three comparison cards.
  // Still render a real default preview instead of creating an invalid custom-* variant
  // that createSelectedPreview rejects before rendering.
  const selectedVariant: MontageVariant = activeVariant ?? (style === "auto" ? montageVariants[0] : {
    ...styleBase,
    id: `custom-${style}-${transitionMode}-${effectStrength}`,
    title: `${styleBase.title} · свои настройки`,
    style,
    transition: transitionMode,
    strength: effectStrength
  });
  const activeRenderedVariant = renderedVariants.find((variant) => variant.id === selectedVariant.id);

  // Automatically render one short, real preview of the currently selected edit.
  // Keep this to one render at a time so mobile browsers do not run out of memory.
  useEffect(() => {
    if (activeTab !== "editor" || !mediaFiles.length || busy || previewBusy) return;
    const generation = previewGeneration.current;
    // The user should see all three real edit directions, not a single auto-selected sample.
    // Remember one automatic attempt per media/settings generation to avoid retry loops on errors.
    if (autoPreviewAttempt.current === generation) return;
    autoPreviewAttempt.current = generation;
    const timer = window.setTimeout(() => { void createStylePreviews(); }, 250);
    return () => window.clearTimeout(timer);
  }, [activeTab, mediaFiles, mediaUrls, style, transitionMode, effectStrength, aspectRatio, musicFile, musicUrl, musicVolume, beatSync, previewBusy, busy, stage, renderedVariants]);

  const normalizedMusicQuery = musicQuery.trim().toLowerCase();
  const filteredMusicPresets = musicPresets.filter((preset) =>
    (musicCategory === "Все" || preset.tags.includes(musicCategory) || preset.mood === musicCategory) &&
    `${preset.title} ${preset.mood} ${preset.description} ${preset.artist} ${preset.tags.join(" ")}`.toLowerCase().includes(normalizedMusicQuery)
  );

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
            {musicFile && musicUrl ? <section className="dravex-current-track">
              <div className="dravex-current-track-top"><span className="dravex-track-icon"><Headphones size={19} /></span><div><strong>Выбранный трек</strong><small>{musicFile.name}</small></div><button type="button" aria-label="Убрать выбранную музыку" onClick={clearMusic}><X size={17} /></button></div>
              <audio controls preload="metadata" src={musicUrl}>Твой браузер не поддерживает аудиоплеер.</audio>
              <div className="dravex-current-track-actions"><button className="dravex-return-editor" type="button" onClick={() => setActiveTab("editor")}><ArrowLeft size={16} />Использовать в монтаже</button></div>
            </section> : <section className="dravex-music-empty"><Headphones size={22} /><div><strong>Музыка пока не выбрана</strong><span>Выбери один из готовых треков ниже или загрузи свой аудиофайл.</span></div><button type="button" onClick={() => musicInput.current?.click()}><Upload size={15} />Загрузить аудио</button></section>}
            <div className="dravex-music-heading"><div><h2>Музыкальная библиотека</h2><p>Готовые треки для эдитов, игровых моментов, экшена и cinematic-видео</p></div><span>{musicPresets.length} треков</span></div>
            <label className="dravex-music-search"><Search size={17} /><input value={musicQuery} onChange={(event) => setMusicQuery(event.target.value)} placeholder="Поиск по стилю или настроению…" aria-label="Поиск музыки" /></label>
            <div className="dravex-music-category-label">Популярные стили для эдитов</div><div className="dravex-music-categories">{musicCategories.map((category) => <button key={category} type="button" className={musicCategory === category ? "is-active" : ""} onClick={() => setMusicCategory(category)}>{category}</button>)}</div>
            <div className="dravex-track-list">{filteredMusicPresets.map((preset) => <article className="dravex-track-card" key={preset.id}>
              <span className={`dravex-track-art art-${preset.style}`}><Music2 size={21} /><span className="dravex-eq"><i /><i /><i /><i /><i /></span></span>
              <div className="dravex-track-details"><strong>{preset.title}</strong><span>{preset.description}</span><small>{preset.tags.slice(0, 2).join(" · ")} <b>·</b> {preset.artist} <b>·</b> CC0</small><audio className="dravex-track-preview" controls preload="none" crossOrigin="anonymous" src={preset.audioUrl} aria-label={`Прослушать ${preset.title}`} /><a className="dravex-track-source" href={preset.sourceUrl} target="_blank" rel="noreferrer">Автор и лицензия</a></div>
              <button type="button" disabled={Boolean(generatingMusicId)} onClick={() => void createMusicPreset(preset)}>{generatingMusicId === preset.id ? <LoaderCircle size={16} className="dravex-spin" /> : <Music2 size={16} />}{generatingMusicId === preset.id ? "Загружаем…" : "Использовать"}</button>
            </article>)}</div>
            {filteredMusicPresets.length === 0 && <p className="dravex-music-no-results">Ничего не найдено. Попробуй другой запрос или категорию.</p>}
            <div className="dravex-music-note"><strong>О лицензиях и популярных песнях</strong><p>Встроенные треки отмечены авторами как CC0, а «Популярные стили» — это подборка звучания для phonk/drift, anime, slowed и Shorts, не оригинальные коммерческие хиты. Для настоящих песен TikTok/CapCut нужны права или официальная лицензированная интеграция. Нажми «Использовать» — DRAVEX загрузит выбранный трек в фоне; скачивать вручную не нужно.</p></div>
            {error && <div className="dravex-error" role="alert">{error}</div>}
            {previewStatus && <p className="dravex-preview-status" role="status">{previewStatus}</p>}
          </div>
        ) : (<>
        <div className="dravex-editor-layout">
          <section className="dravex-stage-column" aria-label="Медиатека и предпросмотр">
            <div className="dravex-intro"><div><span className="dravex-eyebrow">DRAVEX STUDIO</span><h1>Твоя история.<br /><span>Твой монтаж.</span></h1><p>Добавь материал, выбери стиль и собери ролик.</p></div><span className="dravex-editor-badge"><span />Локальный монтаж</span></div>
            <div className="dravex-workflow-steps" role="group" aria-label="Этапы создания видео">
              <span className={!mediaFiles.length ? "is-active" : "is-done"}><b>1</b> Материал</span>
              <span className={stage === "done" || stage === "analyzing" || stage === "rendering" ? "is-done" : mediaFiles.length ? "is-active" : ""}><b>2</b> Монтаж</span>
              <span className={stage === "done" ? "is-done" : stage === "analyzing" || stage === "rendering" ? "is-active" : ""}><b>3</b> Результат</span>
            </div>
            <input ref={videoInput} className="dravex-hidden" type="file" accept="video/*,image/*" multiple onChange={onMediaSelected} />
            <div className="dravex-media-heading"><div><h2>Медиатека</h2><p>{mediaFiles.length ? `${mediaFiles.length} ${isImageMode ? "фото" : "видеофайл"} · ${(mediaFiles.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)} МБ` : "Добавь видео или фотографии для начала"}</p></div>{mediaFiles.length > 0 && isImageMode && <button type="button" onClick={() => { mediaSelectionMode.current = "add"; videoInput.current?.click(); }}><Upload size={15} />Добавить фото</button>}</div>
        {!mediaFiles.length ? (
          <button className="dravex-upload" onClick={() => videoInput.current?.click()} type="button">
            <span className="dravex-upload-icon"><Upload size={25} /></span><strong>Добавить видео или фото</strong><span>Выбери материал из галереи телефона</span><small>Одно видео или несколько фотографий</small>
          </button>
        ) : (
          <div className="dravex-preview-card">
            {isImageMode ? <>
              <div className="dravex-photo-preview" aria-label="Предпросмотр выбранной фотографии">
                <img src={mediaUrls[Math.min(activePhotoIndex, mediaUrls.length - 1)]} alt={mediaFiles[Math.min(activePhotoIndex, mediaFiles.length - 1)]?.name ?? "Выбранная фотография"} />
                <span>Фото {Math.min(activePhotoIndex + 1, mediaFiles.length)} из {mediaFiles.length}</span>
              </div>
              <div className="dravex-image-grid">{mediaFiles.map((file, index) => <div className={`dravex-image-thumb ${activePhotoIndex === index ? "is-active" : ""}`} key={file.name + "-" + index}>
                <img
                  src={mediaUrls[index]}
                  alt={file.name}
                  tabIndex={0}
                  role="button"
                  aria-label={`Показать фото ${index + 1}`}
                  aria-pressed={activePhotoIndex === index}
                  onClick={() => setActivePhotoIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActivePhotoIndex(index);
                    }
                  }}
                />
                <div className="dravex-image-tools">
                  <span title={file.name}>{index + 1}</span>
                  <button type="button" aria-label={`Переместить фото ${index + 1} выше`} title="Выше" disabled={index === 0} onClick={() => reorderPhoto(index, -1)}><ArrowUp size={14} /></button>
                  <button type="button" aria-label={`Переместить фото ${index + 1} ниже`} title="Ниже" disabled={index === mediaFiles.length - 1} onClick={() => reorderPhoto(index, 1)}><ArrowDown size={14} /></button>
                  <button type="button" aria-label={`Удалить фото ${index + 1}`} title="Удалить фото" onClick={() => removePhoto(index)}><Trash2 size={14} /></button>
                </div>
              </div>)}</div>
            </> : <div className="dravex-source-video-wrap"><video className="dravex-preview" src={videoUrl} controls playsInline preload="metadata" onLoadedMetadata={(event) => { const video = event.currentTarget; setVideoPreviewStatus(Number.isFinite(video.duration) && video.duration > 0 ? "ready" : "unsupported"); }} onError={() => setVideoPreviewStatus("error")} /><div className={`dravex-video-status ${videoPreviewStatus === "error" || videoPreviewStatus === "unsupported" ? "is-warning" : ""}`} role="status">{videoPreviewStatus === "ready" ? "Видео загружено · предпросмотр готов" : videoPreviewStatus === "loading" ? "Загружаем предпросмотр видео…" : videoPreviewStatus === "unsupported" ? "Браузер не смог прочитать длительность. Попробуй MP4 (H.264 + AAC) или другое видео." : "Не удалось показать это видео в браузере. Файл может использовать неподдерживаемый кодек; попробуй MP4 (H.264 + AAC)."}</div></div>}
            <div className="dravex-file-row"><div><strong>{isImageMode ? `${mediaFiles.length} фотографий добавлено` : videoFile?.name}</strong><span>{(mediaFiles.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)} МБ</span></div><button type="button" onClick={() => { mediaSelectionMode.current = "replace"; videoInput.current?.click(); }}>Заменить</button></div>
          </div>
        )}

        <div className="dravex-section-title"><div><h2>Стиль монтажа</h2><p>Выбери характер будущего эдита.</p></div><Sparkles size={20} /></div>
        <div className="dravex-variant-rail" aria-label="Варианты автоматического монтажа">
          {montageVariants.map((variant) => {
            const Icon = variant.icon;
            const selected = style === variant.style && transitionMode === variant.transition && effectStrength === variant.strength;
            const rendered = renderedVariants.find((item) => item.id === variant.id);
            return <button key={variant.id} type="button" className={`dravex-variant ${selected ? "is-selected" : ""}`} onClick={() => chooseMontageVariant(variant)} aria-pressed={selected}>
              <span className={`dravex-variant-preview preview-${variant.previewClass} ${rendered ? "has-rendered" : ""}`}>
                {rendered
                  ? <video src={rendered.url} muted playsInline preload="none" />
                  : mediaFiles.length > 0 && isImageMode
                    ? <img src={mediaUrls[0]} alt="" loading="lazy" />
                    : mediaFiles.length > 0 && selected
                      ? <span className="dravex-variant-placeholder"><Icon size={30} /><small>Нажми «Создать варианты», чтобы посмотреть видео</small></span>
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
          <div><strong>Сейчас выбран: {activeRenderedVariant.title}</strong><span>Реальный предпросмотр выбранного варианта монтажа.</span></div>
          <video key={activeRenderedVariant.id} src={activeRenderedVariant.url} controls muted playsInline preload="metadata" />
        </section>}
          </section>
          <aside className="dravex-control-column" aria-label="Управление монтажом">
            <div className="dravex-control-heading"><span className="dravex-control-icon"><Settings2 size={17} /></span><div><h2>Монтаж</h2><p>Настрой результат под себя</p></div></div>
        <div className="dravex-quick-music"><div className="dravex-quick-music-copy"><strong>{musicFile ? "Музыка выбрана" : "Добавь музыку"}</strong><small>{musicFile ? musicFile.name : "Необязательно — можно смонтировать без трека"}</small></div><div className="dravex-quick-music-actions"><button type="button" onClick={() => setActiveTab("music")}><Music2 size={16} />{musicFile ? "Заменить" : "Выбрать музыку"}</button>{musicFile && <button type="button" className="dravex-quick-music-remove" aria-label="Убрать музыку из монтажа" onClick={clearMusic}><X size={16} /></button>}</div></div>
            <p className="dravex-variant-hint">Нажми на одну из трёх карточек, чтобы увидеть реальный фрагмент. Кнопка ниже создаст остальные варианты для сравнения.</p>
        <label className="dravex-music-sync dravex-editor-sync"><input type="checkbox" checked={beatSync} onChange={(event) => { setBeatSync(event.target.checked); invalidateOutput(); }} /><span><strong>Синхронизировать с музыкой</strong><small>{musicFile ? "DRAVEX попробует подстроить смену кадров под ритм выбранного трека." : "Выбери трек во вкладке «Музыка», чтобы монтаж мог учитывать ритм."}</small></span></label>
        <button className="dravex-preview-action" type="button" disabled={!mediaFiles.length || busy || previewBusy || renderedVariants.length === montageVariants.length} onClick={createStylePreviews}>
          {previewBusy ? <LoaderCircle className="dravex-spin" size={17} /> : <Play size={17} />}
          {previewBusy ? `Подготовка автопросмотра… ${previewProgress}%` : renderedVariants.length === montageVariants.length ? "Все варианты готовы" : `Сравнить варианты (${renderedVariants.length}/${montageVariants.length})`}
        </button>
        {previewStatus && <p className="dravex-preview-status" role="status">{previewStatus}</p>}
        {renderedVariants.length > 0 && <p className="dravex-preview-status" role="status">{renderedVariants.length} из {montageVariants.length} вариантов готовы. Нажми на карточку, чтобы посмотреть её крупно и выбрать для полного монтажа.</p>}

        <details className="dravex-more">
          <summary><Settings2 size={16} />Тонкая настройка</summary>
          <div className="dravex-more-content">
            <label className="dravex-duration dravex-duration-slider"><span>Длительность ролика <strong>{duration} сек.</strong></span><input aria-label="Длительность ролика в секундах" type="range" min={5} max={60} step={1} value={duration} onChange={(event) => { setDuration(Number(event.target.value)); invalidateOutput(); }} /><span className="dravex-range-limits"><span>5 сек.</span><span>60 сек.</span></span></label>
            <label className="dravex-duration"><span>Формат кадра</span><select value={aspectRatio} onChange={(event) => { setAspectRatio(event.target.value as "9:16" | "16:9" | "1:1" | "4:5"); invalidateOutput(); }}><option value="9:16">9:16 · TikTok / Shorts</option><option value="16:9">16:9 · YouTube</option><option value="1:1">1:1 · квадрат</option><option value="4:5">4:5 · лента</option></select></label>
            <label className="dravex-duration"><span>Кадрирование</span><select aria-label="Кадрирование видео" value={framingMode} onChange={(event) => { setFramingMode(event.target.value as FramingMode); invalidateOutput(); }}><option value="auto">Умное · сохранить весь кадр при необходимости</option><option value="fit">Весь кадр · без обрезки</option><option value="fill">Заполнить экран · обрезать края</option></select><small>Для игр и интерфейсов выбирай «Весь кадр», чтобы не потерять мини-карту и HUD. «Заполнить экран» увеличивает изображение, но может обрезать края.</small></label>
            <label className="dravex-duration"><span>Качество экспорта</span><select value={quality} onChange={(event) => { setQuality(event.target.value as "720p" | "1080p" | "4K"); invalidateOutput(); }}><option value="720p">720p · быстрее для телефона</option><option value="1080p">1080p · чётче</option><option value="4K">4K · очень высокая нагрузка</option></select>
            {quality === "4K" && <small className="dravex-quality-caution">4K требует много памяти и может не поддерживаться некоторыми телефонами. Для длинных роликов лучше выбрать 720p или 1080p.</small>}</label>
            {musicFile && <label className="dravex-volume"><span>Громкость музыки <strong>{Math.round(musicVolume * 100)}%</strong></span><input type="range" min="0" max="100" step="5" value={Math.round(musicVolume * 100)} onChange={(event) => { setMusicVolume(Number(event.target.value) / 100); invalidateOutput(); }} /></label>}
            <label className="dravex-duration"><span>Переходы</span><select value={transitionMode} onChange={(event) => { setTransitionMode(event.target.value as "auto" | "cinematic" | "action"); invalidateOutput(); }}><option value="auto">Автоматические · разные</option><option value="cinematic">Кинематографичные · растворение</option><option value="action">Экшен · резкие движения</option></select></label>
            <label className="dravex-duration"><span>Сила движения и эффектов</span><select value={effectStrength} onChange={(event) => { setEffectStrength(event.target.value as "soft" | "balanced" | "strong"); invalidateOutput(); }}><option value="soft">Мягкая · спокойнее</option><option value="balanced">Сбалансированная</option><option value="strong">Сильная · динамичнее</option></select></label>
          </div>
          <div className="dravex-project-actions">
            <button type="button" onClick={clearEditor} disabled={!mediaFiles.length || busy || previewBusy || projectBusy}><Trash2 size={15} />Очистить редактор</button>
            <button type="button" onClick={saveProject} disabled={!mediaFiles.length || projectBusy}><Save size={15} />{projectBusy ? "Сохраняем…" : "Сохранить проект"}</button>
            <button type="button" onClick={restoreProject} disabled={projectBusy || busy || previewBusy}><FolderOpen size={15} />Восстановить проект</button>
          </div>
          {projectMessage && <p className="dravex-project-message" role="status">{projectMessage}</p>}
        </details>

        <button className="dravex-create" type="button" disabled={!mediaFiles.length || busy || previewBusy} onClick={createMontage}>{busy ? <LoaderCircle className="dravex-spin" size={20} /> : <WandSparkles size={20} />}{stage === "rendering" ? "Создаём видео…" : stage === "analyzing" ? "Анализируем материал…" : "Автомонтаж"}</button>
        <p className="dravex-privacy">Файлы обрабатываются в браузере и не отправляются на сервер. Черновик автоматически сохраняется для восстановления в этой вкладке; при новом сеансе редактор начинает с чистого проекта. Используй «Сохранить проект», если хочешь сохранить его отдельно на устройстве.</p>

        {busy && <div className="dravex-progress"><div className="dravex-progress-top"><strong>{stage === "analyzing" ? "Анализ материала" : "Создание ролика"}</strong><span>{stage === "analyzing" ? `${getScanPercent(scan)}%` : `${renderProgress}%`}</span></div><div className="dravex-progress-track"><span style={{ width: `${stage === "analyzing" ? getScanPercent(scan) : renderProgress}%` }} /></div><p>{message}</p><small>Не закрывай вкладку во время создания видео.</small></div>}
        {error && <div className="dravex-error" role="alert">{error}</div>}
        {stage === "done" && outputUrl && <section className="dravex-result"><div className="dravex-result-title"><CheckCircle2 size={21} /><div><strong>Видео готово!</strong><span>{cutCount} фрагментов · стиль: {usedStyle} · {quality} · формат WebM</span></div></div><video className="dravex-output" src={outputUrl} controls playsInline /><div className="dravex-result-actions"><a href={outputUrl} download={outputName}><Download size={17} />Сохранить видео</a><button type="button" onClick={createMontage}><RefreshCw size={16} />Создать ещё</button></div>{qualityCheckBusy ? <p className="dravex-quality-report" role="status">Проверяем экспортированные кадры и ищем возможные чёрные или зависшие фрагменты…</p> : qualityReport && <div className={`dravex-quality-report ${qualityReport.severity === "warning" ? "is-warning" : "is-ok"}`} role="status"><strong>{qualityReport.severity === "warning" ? "Проверка просит внимания" : "Автопроверка завершена"}</strong><span>{qualityReport.width && qualityReport.height ? `${qualityReport.width}×${qualityReport.height} · ${qualityReport.duration.toFixed(1)} с · проверено кадров: ${qualityReport.sampledFrames}` : "Проверка видеокадров не завершилась."}</span><ul>{qualityReport.findings.map((finding, index) => <li key={`${index}-${finding}`}>{finding}</li>)}</ul></div>}</section>}
          </aside>
        </div>
        </>)}
      </section>

      <footer className="dravex-footer"><Clapperboard size={15} />DRAVEX <span>·</span> Просто создавай</footer>
    </main>
  );
}

function getScanPercent(scan: HighlightProgress) {
  return scan.total ? Math.round((scan.current / scan.total) * 100) : 0;
}