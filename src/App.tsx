import { cloneElement, isValidElement, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { renderImageSlideshow } from "./video/local-render";
import { renderVideoSequence } from "./video/video-sequence-render";
import EvolutionEngine, { trackEvolutionEvent } from "./EvolutionEngine";
import {
  Aperture, ArrowDown, ArrowRight, ArrowUp, AudioLines, Check, ScanSearch,
  ChevronDown, Clapperboard, Download, FileVideo, Film, FolderOpen, Gauge,
  Layers3, MonitorPlay, Music2, Plus, Settings2, Heart,
  ShieldCheck, Sparkles, Trash2, Upload, WandSparkles, X
} from "lucide-react";


type Language = "en" | "ru";
const russianText: Record<string, string> = {"WORKSPACE":"РАБОЧЕЕ ПРОСТРАНСТВО","PROJECT":"ПРОЕКТ","Import media":"Импортировать медиа","Local renderer exports WebM from trimmed video clips and mixed video/image sequences, and can mix imported audio files at a fixed level. Transitions, volume automation, MP4 export, and connected AI generation are still in development.":"Локальный движок экспортирует WebM из обрезанных видео и смешанных последовательностей видео/изображений, а также добавляет импортированные аудиофайлы с фиксированной громкостью. Переходы, автоматизация громкости, MP4 и подключение ИИ ещё разрабатываются.","CLIP TRIM":"ОБРЕЗКА КЛИПА","Seconds":"Секунды","Start":"Начало","End":"Конец","selected":"выбрано","Rendering your ordered video and image clips with source audio locally in your browser…":"Создаём последовательность видео и изображений с исходным звуком прямо в браузере…","Rendering your montage with imported background audio locally in your browser…":"Создаём монтаж с импортированной фоновой музыкой прямо в браузере…","Rendering trimmed video clips with their original audio locally in your browser…":"Создаём обрезанные видеоклипы с исходным звуком прямо в браузере…","Montage exported as WebM with imported background audio mixed in locally. Advanced volume automation, transitions, and MP4 export are still upcoming.":"Монтаж экспортирован в WebM с добавленной фоновой музыкой. Автоматизация громкости, переходы и MP4 ещё разрабатываются.","Video sequence exported as WebM from your trimmed source clips with original audio where supported. Transitions and MP4 export are still upcoming.":"Последовательность видео экспортирована в WebM с исходным звуком, если браузер его поддерживает. Переходы и MP4 ещё разрабатываются.","Rendering a short image montage locally in your browser…":"Создаём короткий видеомонтаж из изображений прямо в браузере…","Import at least one video clip or image before rendering.":"Перед экспортом импортируй хотя бы один видеоклип или изображение.","Mixed video/image sequence exported as WebM in timeline order. Original video audio is included when supported by the browser; separate audio files, transitions, and MP4 export are still upcoming.":"Смешанная последовательность видео и изображений экспортирована в WebM в порядке монтажной шкалы. Исходный звук видео включён, если браузер поддерживает запись аудиодорожки; отдельные аудиофайлы, переходы и MP4 добавим позже.","Image montage exported as WebM with motion and the selected style. Audio and MP4 export are still upcoming.":"Монтаж из изображений экспортирован в WebM с движением и выбранным стилем. Звук и MP4 добавим позже.","Save project file":"Сохранить файл проекта","Local-first prototype":"Локальный прототип","Your media stays in this browser session.":"Ваши медиафайлы остаются в текущем сеансе браузера.","Early prototype":"Ранний прототип","Session only":"Только текущий сеанс","Save project":"Сохранить проект","YOUR STORY, YOUR RULES":"ТВОЯ ИСТОРИЯ — ТВОИ ПРАВИЛА","Make something":"Создай нечто","worth watching.":"Достойное просмотра.","Your timeline.":"Твоя монтажная шкала.","Your creative control.":"Твой творческий контроль.","Describe the video in your head. Build a plan, bring in your footage, and shape the final cut.":"Опиши видео, которое представляешь. Составь план, добавь материалы и создай финальный монтаж.","Work directly with your media. No AI required — you stay in control of every creative decision.":"Работай напрямую со своими материалами. ИИ не обязателен — каждое творческое решение остаётся за тобой.","Plan with AI assistance":"Планирование с помощью ИИ","Edit it your way":"Монтируй по-своему","Describe your video":"Опиши своё видео",
"Tip: describe the mood, story, and editing style in your prompt.":"Подсказка: опиши настроение, сюжет и стиль монтажа в запросе.","Teach DRAVEX with a reference":"Научи DRAVEX на примере","Import a video into the media library, then inspect its pacing and likely cuts.":"Импортируй видео в медиатеку, чтобы изучить темп и вероятные склейки.","No reference video imported":"Референсное видео не импортировано","The first imported video will be analyzed locally.":"Первое импортированное видео будет проанализировано прямо в браузере.","Use Import to choose a video from your device.":"Нажми «Импорт», чтобы выбрать видео на устройстве.","Analyzing…":"Анализируем…","Analyze reference":"Анализировать пример","Import a reference video first, then analyze its editing rhythm.":"Сначала импортируй пример видео, затем проанализируй ритм монтажа.","Analyzing reference video locally in your browser…":"Анализируем пример видео прямо в браузере…","This local first pass detects visual changes; it does not yet understand the story, spoken words, or music beats.":"Этот первый локальный анализ обнаруживает визуальные изменения, но пока не понимает сюжет, речь или музыкальный ритм.","Reference analysis complete. This is a local visual estimate, not semantic AI analysis.":"Анализ примера завершён. Это локальная оценка изображения, а не семантический анализ ИИ.","This video could not be read by the browser.":"Браузер не смог прочитать это видео.","The reference video is too short or its duration is unavailable.":"Референс слишком короткий или длительность недоступна.","Frame analysis is not supported in this browser.":"Этот браузер не поддерживает анализ кадров.","Could not sample a frame from this video.":"Не удалось получить кадр из видео.","Reference analysis failed.":"Не удалось проанализировать пример.","Start with an idea. Be as specific as you like.":"Начни с идеи. Чем подробнее, тем лучше.","YOUR CREATIVE BRIEF":"ТВОЯ ИДЕЯ","A cinematic night drive through a neon city, fast cuts synced to the beat, dramatic opening and a powerful finish…":"Кинематографичная ночная поездка по неоновому городу, быстрый монтаж в ритм музыки, драматичное начало и мощный финал…","Mood":"Настроение","Story":"История","Editing style":"Стиль монтажа","Set the direction":"Настрой видео","Adjust the output to fit your platform.":"Настрой результат под свою платформу.","Aspect ratio":"Соотношение сторон","Target length":"Длительность","Output quality":"Качество видео","Build my video plan":"Создать план видео","Local planning demo — no external AI model is connected yet.":"Локальная демонстрация планирования — внешняя модель ИИ пока не подключена.","Your creative plan":"Твой план видео","A first outline for your next cut.":"Первый набросок будущего ролика.","DRAFT":"ЧЕРНОВИК","YOUR NEXT IDEA":"ТВОЯ СЛЕДУЮЩАЯ ИДЕЯ","Your next idea starts here":"Твоя следующая идея начинается здесь","Your outline will appear here after you describe the video and build a plan.":"Здесь появится план после того, как ты опишешь видео и создашь план.","Waiting for your brief":"Ожидаем твою идею","Draft ready to review":"Черновик готов к просмотру","Create automatic montage":"Создать автоматический монтаж","Local prototype: WebM export from images with automatic visual scoring and style-aware motion. Audio mixing, MP4, and mixed image/video timelines are still in development.":"Первая версия создаёт WebM из изображений прямо на устройстве. Экспорт MP4, звук и обработка видеоклипов пока не поддерживаются.","YOUR ASSETS":"ТВОИ МАТЕРИАЛЫ","Media library":"Медиатека","Add media":"Добавить медиа","Drop your media into the story":"Добавь материалы в проект","Or tap to browse files on your device":"Или нажми, чтобы выбрать файлы на устройстве","VIDEO · IMAGE · AUDIO":"ВИДЕО · ИЗОБРАЖЕНИЯ · АУДИО","PREVIEW":"ПРЕДПРОСМОТР","Your preview lives here":"Здесь будет предпросмотр","Import media to get started.":"Импортируй файлы, чтобы начать.","No media selected":"Медиа не выбраны","EDITING WORKSPACE":"МОНТАЖНОЕ ПРОСТРАНСТВО","Timeline":"Монтажная шкала","FOUNDATION":"ОСНОВА","Export project":"Экспорт проекта","Your timeline is ready":"Монтажная шкала готова","Add media to start building your sequence.":"Добавь медиафайлы, чтобы начать собирать последовательность.","Add first clip":"Добавить первый клип","This build supports clip trim points, local WebM export of ordered video/image sequences, and imported background audio mixed in the browser. Transitions, advanced volume controls, MP4 export, and connected AI generation are still in development.":"Эта версия поддерживает обрезку клипов, локальный экспорт последовательности видео/изображений в WebM и добавление фонового аудио в браузере. Переходы, расширенные настройки громкости, MP4 и подключение ИИ ещё разрабатываются.","BUILDING THE FUTURE OF VIDEO":"СОЗДАЁМ БУДУЩЕЕ ВИДЕО","Your choice. Your workflow.":"Твой выбор. Твой рабочий процесс.","Dismiss message":"Закрыть сообщение","Add more":"Добавить ещё","Move clip up":"Переместить клип вверх","Move clip down":"Переместить клип вниз","Remove clip":"Удалить клип","Move up":"Вверх","Move down":"Вниз","Remove":"Удалить","MEDIA":"МЕДИА","BETA":"БЕТА","Describe the video you want to make first.":"Сначала опиши видео, которое хочешь создать.","Draft plan created locally. This is a planning preview, not a rendered video.":"Черновой план создан локально. Это предварительный план, а не готовое видео.","Add at least one image to render a short video. Video-clip rendering is coming later.":"Добавь хотя бы одно изображение, чтобы создать короткое видео. Обработка видеоклипов появится позже.","Rendering a short video locally in your browser…":"Создаём короткое видео прямо в браузере…","Automatic montage rendered as WebM with image scoring, camera motion, crossfades, and the selected visual style. Audio mixing and MP4 export are still upcoming.":"Видео создано и скачано в формате WebM. Эта версия использует изображения, движение и заголовок; звук и экспорт MP4 добавим позже.","Video rendering failed. Please try fewer or smaller images.":"Не удалось создать видео. Попробуй использовать меньше изображений или файлы меньшего размера.","Project settings exported as a .dravex.json file. Source media is not embedded.":"Настройки проекта экспортированы в файл .dravex.json. Исходные медиафайлы в него не включены.","Choose a video, image, or audio file.":"Выбери видео, изображение или аудиофайл.","Import your clips, choose the order, preview each item, and prepare a project file. More precise timeline tools and finished-video rendering are still being built.":"Импортируй клипы, выбери их порядок, просмотри каждый файл и подготовь файл проекта. Точные инструменты монтажа и экспорт готового видео ещё разрабатываются.","Language":"Язык","Edit style":"Стиль монтажа","Velocity / Beat Sync":"Velocity / в ритм музыки","Anime / AMV":"Аниме / AMV","Cinematic":"Кинематографичный","Glitch / Cyberpunk":"Глитч / киберпанк","Clean Storytelling":"Чистое повествование","02 · VISUALS — Pick the strongest action shots and build speed ramps into key moments.":"02 · ВИЗУАЛ — Выбери самые сильные экшен-кадры и добавь ускорения в ключевых моментах.","03 · RHYTHM — Cut on the beat; alternate quick bursts with short slow-motion accents.":"03 · РИТМ — Режь в такт музыке, чередуя быстрые фрагменты с короткими замедлениями.","05 · FINISH — Save the biggest reveal for the music drop and end on a clean loop.":"05 · ФИНАЛ — Прибереги главный момент для музыкального дропа и закончи плавной зацикленной сценой.","02 · VISUALS — Frame the hero clearly; use close-ups, impact poses, and dramatic contrast.":"02 · ВИЗУАЛ — Чётко покажи героя: используй крупные планы, эффектные позы и драматичный контраст.","03 · RHYTHM — Use fast motion cuts, brief impact flashes, shake, and whoosh accents sparingly.":"03 · РИТМ — Используй быстрые склейки по движению, короткие вспышки, тряску и звуки ударов умеренно.","05 · FINISH — Build toward one signature hero moment, then finish with a strong freeze-frame.":"05 · ФИНАЛ — Подведи монтаж к главному моменту героя и заверши выразительным стоп-кадром.","02 · VISUALS — Establish the scene, then use deliberate close-ups and controlled movement.":"02 · ВИЗУАЛ — Сначала покажи обстановку, затем добавь осмысленные крупные планы и плавное движение.","03 · RHYTHM — Let emotional shots breathe; use smooth zooms and only a few purposeful cuts.":"03 · РИТМ — Дай эмоциональным кадрам раскрыться; используй плавные приближения и немного точных склеек.","05 · FINISH — Resolve the story with a memorable final frame and a gentle fade.":"05 · ФИНАЛ — Заверши историю запоминающимся кадром и мягким затемнением.","02 · VISUALS — Use bold silhouettes, neon contrast, and clean focal points for each shot.":"02 · ВИЗУАЛ — Используй выразительные силуэты, неоновый контраст и чёткий центр внимания.","03 · RHYTHM — Place brief glitch or RGB-split accents on selected beats, not every cut.":"03 · РИТМ — Добавляй короткие глитч-эффекты и RGB-смещение на отдельных ударах, а не при каждой склейке.","05 · FINISH — Hit one controlled digital distortion at the climax, then return to a crisp image.":"05 · ФИНАЛ — Добавь один цифровой сбой в кульминации и вернись к чёткому изображению.","02 · VISUALS — Choose readable shots that clearly show the subject and what is happening.":"02 · ВИЗУАЛ — Выбирай понятные кадры, где хорошо видны герой и происходящее.","03 · RHYTHM — Keep cuts purposeful, captions short, and the story easy to follow without sound.":"03 · РИТМ — Делай осмысленные склейки, короткие подписи и понятную историю даже без звука.","05 · FINISH — Deliver a clear payoff and finish before the idea starts to feel repetitive.":"05 · ФИНАЛ — Дай зрителю понятную развязку и закончи до того, как монтаж начнёт повторяться.","Choose music that matches the edit rhythm; generated audio is not available yet.":"Подбери музыку под ритм монтажа; генерация звука пока недоступна."};
function translateText(value: string, language: Language): string {
  if (language === "en") return value;
  const trimmed = value.trim();
  if (russianText[trimmed]) return value.replace(trimmed, russianText[trimmed]);
  const durationMatch = trimmed.match(/^(\d+) seconds?$/);
  if (durationMatch) return `${durationMatch[1]} сек.`;
  if (trimmed === "2 minutes") return "2 минуты";
  if (trimmed === "5 minutes") return "5 минут";
  if (trimmed === "10+ minutes") return "10+ минут";
  if (trimmed.startsWith("01 · OPEN — Start with a clear visual hook for")) return trimmed.replace("01 · OPEN — Start with a clear visual hook for", "01 · НАЧАЛО — Начни с яркого визуального момента для");
  if (trimmed === "02 · SELECT — Use your imported footage as the primary visual source.") return "02 · ОТБОР — Используй импортированные материалы как основной визуальный источник.";
  if (trimmed === "02 · VISUALS — Add your own clips or images; generative media is not connected yet.") return "02 · ВИЗУАЛ — Добавь свои клипы или изображения; генерация материалов пока не подключена.";
  if (trimmed === "03 · BUILD — Arrange the strongest moments into a beginning, middle, and ending.") return "03 · СБОРКА — Расположи лучшие моменты в начале, середине и финале.";
  if (trimmed === "04 · SOUND — Review the imported audio and keep dialogue understandable.") return "04 · ЗВУК — Проверь импортированное аудио и сохрани разборчивость диалогов.";
  if (trimmed === "04 · SOUND — Add music or voiceover later; no audio has been generated.") return "04 · ЗВУК — Позже добавь музыку или озвучку; аудио ещё не создано.";
  if (trimmed.startsWith("05 · FINISH — Prepare a ")) return trimmed.replace("05 · FINISH — Prepare a", "05 · ФИНАЛ — Подготовь композицию").replace(" composition, target length ", ", длительность ").replace(", export target ", ", качество экспорта ");
  let match = trimmed.match(/^Added (\d+) media files? to this session\.$/);
  if (match) return `Добавлено медиафайлов: ${match[1]}.`;
  match = trimmed.match(/^(\d+) video(s?) · (.+) known duration$/);
  if (match) return `${match[1]} видео · ${match[3]} — известная длительность`;
  match = trimmed.match(/^(\d+) media files added$/);
  if (match) return `Добавлено медиафайлов: ${match[1]}`;
  match = trimmed.match(/^Rendering video… (\d+)%$/);
  if (match) return `Создаём видео… ${match[1]}%`;
  return value;
}
function localize(node: ReactNode, language: Language): ReactNode {
  if (typeof node === "string") return translateText(node, language);
  if (Array.isArray(node)) return node.map((child) => localize(child, language));
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  const nextProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "children") nextProps.children = localize(value as ReactNode, language);
    else if ((key === "placeholder" || key === "title" || key === "aria-label") && typeof value === "string") nextProps[key] = translateText(value, language);
    else nextProps[key] = value;
  }
  return cloneElement(node as ReactElement<Record<string, unknown>>, nextProps as Partial<Record<string, unknown>>);
}

type Mode = "ai" | "manual" | "collab";
type EditStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story";
const editRecipes: Record<EditStyle, { visuals: string; rhythm: string; finish: string }> = {
  velocity: {
    visuals: "02 · VISUALS — Pick the strongest action shots and build speed ramps into key moments.",
    rhythm: "03 · RHYTHM — Cut on the beat; alternate quick bursts with short slow-motion accents.",
    finish: "05 · FINISH — Save the biggest reveal for the music drop and end on a clean loop."
  },
  anime: {
    visuals: "02 · VISUALS — Frame the hero clearly; use close-ups, impact poses, and dramatic contrast.",
    rhythm: "03 · RHYTHM — Use fast motion cuts, brief impact flashes, shake, and whoosh accents sparingly.",
    finish: "05 · FINISH — Build toward one signature hero moment, then finish with a strong freeze-frame."
  },
  cinematic: {
    visuals: "02 · VISUALS — Establish the scene, then use deliberate close-ups and controlled movement.",
    rhythm: "03 · RHYTHM — Let emotional shots breathe; use smooth zooms and only a few purposeful cuts.",
    finish: "05 · FINISH — Resolve the story with a memorable final frame and a gentle fade."
  },
  glitch: {
    visuals: "02 · VISUALS — Use bold silhouettes, neon contrast, and clean focal points for each shot.",
    rhythm: "03 · RHYTHM — Place brief glitch or RGB-split accents on selected beats, not every cut.",
    finish: "05 · FINISH — Hit one controlled digital distortion at the climax, then return to a crisp image."
  },
  story: {
    visuals: "02 · VISUALS — Choose readable shots that clearly show the subject and what is happening.",
    rhythm: "03 · RHYTHM — Keep cuts purposeful, captions short, and the story easy to follow without sound.",
    finish: "05 · FINISH — Deliver a clear payoff and finish before the idea starts to feel repetitive."
  }
};
type ClipKind = "video" | "audio" | "image";
type ReferenceRecipe = { name: string; duration: number; pace: "Fast" | "Medium" | "Slow"; averageShot: number; cutTimes: number[] };
type MediaClip = {
  id: string;
  name: string;
  kind: ClipKind;
  url: string;
  bytes: number;
  duration?: number;
  trimStart?: number;
  trimEnd?: number;
};

const uid = () => `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const formatTime = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function App() {
  const [mode, setMode] = useState<Mode>("ai");
  const [language, setLanguage] = useState<Language>("en");
  const [clips, setClips] = useState<MediaClip[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [quality, setQuality] = useState("1080p");
  const [targetLength, setTargetLength] = useState("30 seconds");
  const [editStyle, setEditStyle] = useState<EditStyle>("velocity");
  const [plan, setPlan] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [projectName, setProjectName] = useState("Untitled project");
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [musicVolume, setMusicVolume] = useState(65);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [referenceReport, setReferenceReport] = useState<string[]>([]);
  const [referenceRecipe, setReferenceRecipe] = useState<ReferenceRecipe | null>(null);
  const [isAnalyzingReference, setIsAnalyzingReference] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const activeClip = clips.find((clip) => clip.id === activeId) ?? clips[0] ?? null;
  const videoCount = clips.filter((clip) => clip.kind === "video").length;
  const totalBytes = clips.reduce((sum, clip) => sum + clip.bytes, 0);
  const estimatedDuration = useMemo(
    () => clips.reduce((sum, clip) => {
      if (clip.kind === "video" && clip.duration) {
        const start = Math.max(0, clip.trimStart ?? 0);
        const end = Math.min(clip.duration, clip.trimEnd ?? clip.duration);
        return sum + Math.max(0, end - start);
      }
      if (clip.kind === "image") return sum + 3;
      return sum + (clip.duration ?? 0);
    }, 0),
    [clips]
  );

  const addFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const accepted = Array.from(fileList).filter((file) =>
      file.type.startsWith("video/") || file.type.startsWith("audio/") || file.type.startsWith("image/")
    );
    const newClips = accepted.map((file): MediaClip => ({
      id: uid(),
      name: file.name,
      kind: file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image",
      url: URL.createObjectURL(file),
      bytes: file.size
    }));
    setClips((current) => [...current, ...newClips]);
    if (newClips.length) trackEvolutionEvent("media_imported");
    if (!activeId && newClips[0]) setActiveId(newClips[0].id);
    setNotice(newClips.length ? `Added ${newClips.length} media file${newClips.length === 1 ? "" : "s"} to this session.` : "Choose a video, image, or audio file.");
    window.setTimeout(() => setNotice(""), 4000);
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const removeClip = (id: string) => {
    trackEvolutionEvent("clip_changed");
    const clip = clips.find((item) => item.id === id);
    const next = clips.filter((item) => item.id !== id);
    if (clip && !next.some((item) => item.url === clip.url)) URL.revokeObjectURL(clip.url);
    setClips(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const moveClip = (id: string, direction: -1 | 1) => {
    trackEvolutionEvent("clip_changed");
    setClips((current) => {
      const index = current.findIndex((clip) => clip.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const splitClipAtPlayhead = () => {
    if (!activeClip || activeClip.kind !== "video" || !activeClip.duration) return;
    const start = Math.max(0, activeClip.trimStart ?? 0);
    const end = Math.min(activeClip.duration, activeClip.trimEnd ?? activeClip.duration);
    const splitAt = playheadTime;
    if (splitAt <= start + 0.1 || splitAt >= end - 0.1) {
      setNotice(language === "ru"
        ? "Поставь видео на паузу или перемотай внутрь выбранного диапазона, затем раздели клип."
        : "Seek inside the selected trim range, then split the clip.");
      window.setTimeout(() => setNotice(""), 4500);
      return;
    }
    const first: MediaClip = { ...activeClip, id: uid(), name: activeClip.name.replace(/\.[^.]+$/, "") + " · 1", trimStart: start, trimEnd: splitAt };
    const second: MediaClip = { ...activeClip, id: uid(), name: activeClip.name.replace(/\.[^.]+$/, "") + " · 2", trimStart: splitAt, trimEnd: end };
    setClips((current) => {
      const index = current.findIndex((clip) => clip.id === activeClip.id);
      if (index < 0) return current;
      const next = [...current];
      next.splice(index, 1, first, second);
      return next;
    });
    setActiveId(second.id);
    trackEvolutionEvent("clip_changed");
    setNotice(language === "ru" ? "Клип разделён на две части по текущей позиции воспроизведения." : "Clip split into two segments at the current playhead.");
    window.setTimeout(() => setNotice(""), 4500);
  };

  const makePlan = () => {
    const imageClips = clips.filter((clip) => clip.kind === "image");
    if (!prompt.trim() && imageClips.length === 0) {
      setNotice("Describe the video or add images so DRAVEX can plan a montage.");
      window.setTimeout(() => setNotice(""), 3500);
      return;
    }
    const idea = prompt.trim().replace(/[.!?]+$/, "");
    const hasAudio = clips.some((clip) => clip.kind === "audio");
    const recipe = editRecipes[editStyle];
    const imageSummary = imageClips.length
      ? `02 · IMAGE ANALYSIS — ${imageClips.length} image(s) will be scored for contrast, color, and visual impact. The strongest frame opens the montage.`
      : "02 · VISUALS — Add images to enable automatic visual analysis and montage rendering.";
    const next = [
      `01 · STORY — ${idea ? `Build the edit around “${idea}”.` : "Use the uploaded images as the story source and infer a visual sequence."}`,
      imageSummary,
      recipe.visuals,
      recipe.rhythm,
      hasAudio ? "04 · SOUND — Original audio from video clips can be included; separately imported audio files are not mixed into the export yet." : "04 · SOUND — Original video audio is preserved where supported, and imported audio files can be mixed into sequence exports at a fixed volume.",
      recipe.finish
    ];
    setPlan(next);
    trackEvolutionEvent("plan_created");
    setNotice("Automatic edit plan prepared. Image scoring and style-aware motion run locally during rendering; this is not a connected AI model yet.");
    window.setTimeout(() => setNotice(""), 6000);
  };

  const analyzeReference = async () => {
    const reference = clips.find((clip) => clip.kind === "video");
    if (!reference) {
      setNotice("Import a reference video first, then analyze its editing rhythm.");
      window.setTimeout(() => setNotice(""), 4000);
      return;
    }
    setIsAnalyzingReference(true);
    setReferenceReport([]);
    setReferenceRecipe(null);
    setNotice("Analyzing reference video locally in your browser…");
    try {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = reference.url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("This video could not be read by the browser."));
      });
      const duration = Math.min(video.duration || 0, 120);
      if (!Number.isFinite(duration) || duration < 1) throw new Error("The reference video is too short or its duration is unavailable.");
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Frame analysis is not supported in this browser.");
      const sampleTimes = Array.from({ length: Math.max(2, Math.ceil(duration * 2)) }, (_, i) => Math.min(i * 0.5 + 0.05, Math.max(0.05, duration - 0.08)));
      let previous: Uint8ClampedArray | null = null;
      const cutTimes: number[] = [];
      for (const time of sampleTimes) {
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => { video.removeEventListener("error", onError); resolve(); };
          const onError = () => { video.removeEventListener("seeked", onSeeked); reject(new Error("Could not sample a frame from this video.")); };
          video.addEventListener("seeked", onSeeked, { once: true });
          video.addEventListener("error", onError, { once: true });
          video.currentTime = time;
        });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let luma = 0;
        for (let i = 0; i < pixels.length; i += 4) luma += (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722);
        luma /= (pixels.length / 4);
        if (previous) {
          let difference = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            difference += (Math.abs(pixels[i] - previous[i]) + Math.abs(pixels[i + 1] - previous[i + 1]) + Math.abs(pixels[i + 2] - previous[i + 2])) / 3;
          }
          difference /= (pixels.length / 4);
          if (difference > 42 && time > 0.4 && (cutTimes.length === 0 || time - cutTimes[cutTimes.length - 1] >= 1)) cutTimes.push(time);
        }
        previous = new Uint8ClampedArray(pixels);
      }
      const averageShot = duration / Math.max(1, cutTimes.length + 1);
      const pace = averageShot < 1.5 ? "Fast" : averageShot < 3.5 ? "Medium" : "Slow";
      const report = [
        `REFERENCE — ${reference.name}`,
        `DURATION — About ${Math.round(video.duration)} seconds`,
        `EDITING RHYTHM — ${pace}; estimated average shot length ${averageShot.toFixed(1)} seconds`,
        `SCENE CHANGES — About ${cutTimes.length} likely visual cuts detected`,
        cutTimes.length ? `CUT MARKERS — ${cutTimes.slice(0, 12).map((time) => `${time.toFixed(1)}s`).join(", ")}` : "CUT MARKERS — No clear cuts detected at the sampled intervals",
        "LIMITATION — This local first pass detects visual changes; it does not yet understand the story, spoken words, or music beats."
      ];
      setReferenceReport(report);
      trackEvolutionEvent("reference_analyzed");
      setReferenceRecipe({ name: reference.name, duration: video.duration, pace, averageShot, cutTimes: cutTimes.slice(0, 12) });
      setNotice("Reference analysis complete. This is a local visual estimate, not semantic AI analysis.");
      window.setTimeout(() => setNotice(""), 6000);
      video.removeAttribute("src");
      video.load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Reference analysis failed.");
      window.setTimeout(() => setNotice(""), 5000);
    } finally {
      setIsAnalyzingReference(false);
    }
  };

  const applyReferenceRecipe = () => {
    if (!referenceRecipe) return;
    const fast = referenceRecipe.pace === "Fast";
    const slow = referenceRecipe.pace === "Slow";
    const shotRange = fast ? "0.5–1.2 s" : slow ? "2.5–4 s" : "1.2–2.5 s";
    const ruShotRange = fast ? "0,5–1,2 с" : slow ? "2,5–4 с" : "1,2–2,5 с";
    const recipe = language === "ru" ? [
      `РЕЦЕПТ МОНТАЖА — по примеру «${referenceRecipe.name}»`,
      `01 · ЗАЦЕПКА — начни с самого сильного момента в первые 1–2 секунды.`,
      `02 · ТЕМП — ${referenceRecipe.pace === "Fast" ? "быстрый" : referenceRecipe.pace === "Slow" ? "медленный" : "средний"} ритм; ориентир длительности кадра ${ruShotRange}.`,
      `03 · СКЛЕЙКИ — обнаружено примерно ${referenceRecipe.cutTimes.length} вероятных смен кадра; используй метки как подсказки, а не точные границы.`,
      `04 · РАЗВИТИЕ — чередуй основные моменты с короткими переходными кадрами, сохраняя выбранный стиль «${editStyle}».`,
      `05 · ФИНАЛ — оставь сильнейший момент ближе к концу и заверши чистым кадром.`,
      `ОГРАНИЧЕНИЕ — это рецепт по визуальному темпу, а не понимание сюжета или музыки.`
    ] : [
      `EDIT RECIPE — inspired by “${referenceRecipe.name}”`,
      "01 · HOOK — open with the strongest moment in the first 1–2 seconds.",
      `02 · PACING — ${referenceRecipe.pace.toLowerCase()} rhythm; target shot length around ${shotRange}.`,
      `03 · CUTS — about ${referenceRecipe.cutTimes.length} likely visual changes detected; use markers as guides, not exact edit points.`,
      `04 · BUILD — alternate key moments with short connective shots, keeping the selected “${editStyle}” style.`,
      "05 · FINISH — save a strong moment for the ending and finish on a clean frame.",
      "LIMITATION — this recipe reflects visual pacing, not story or music understanding."
    ];
    setPlan(recipe);
    setMode("ai");
    setNotice(language === "ru" ? "Рецепт перенесён в план монтажа. Это рекомендации по темпу, а не автоматическая нарезка исходного видео." : "Recipe added to your edit plan. These are pacing guidelines, not automatic trimming of the source video.");
    window.setTimeout(() => setNotice(""), 5000);
  };

  const renderVideo = async () => {
    const videoClips = clips.filter((clip) => clip.kind === "video");
    const audioClips = clips.filter((clip) => clip.kind === "audio");
    const visualClips = clips.filter((clip) => clip.kind === "video" || clip.kind === "image");
    const images = clips.filter((clip) => clip.kind === "image").map(({ name, url }) => ({ name, url }));
    if (!visualClips.length) {
      setNotice("Import at least one video clip or image before rendering.");
      window.setTimeout(() => setNotice(""), 5000);
      return;
    }
    setIsRendering(true);
    setRenderProgress(0);
    setNotice(audioClips.length
      ? "Rendering your montage with imported background audio locally in your browser…"
      : videoClips.length
        ? "Rendering trimmed video clips with their original audio locally in your browser…"
        : "Rendering a short image montage locally in your browser…");
    try {
      const useSequenceRenderer = videoClips.length > 0 || audioClips.length > 0;
      const blob = useSequenceRenderer
        ? await renderVideoSequence({
            segments: visualClips.map((clip) => clip.kind === "image"
              ? { kind: "image" as const, name: clip.name, url: clip.url, duration: 3 }
              : {
                  kind: "video" as const,
                  name: clip.name,
                  url: clip.url,
                  trimStart: clip.trimStart ?? 0,
                  trimEnd: clip.trimEnd && clip.trimEnd > (clip.trimStart ?? 0) ? clip.trimEnd : (clip.duration ?? 0)
                }),
            audioTracks: audioClips.map(({ name, url }) => ({ name, url, volume: musicVolume / 100 })),
            title: prompt || projectName,
            aspectRatio: aspect,
            onProgress: setRenderProgress
          })
        : await renderImageSlideshow({
            images,
            title: prompt || projectName,
            aspectRatio: aspect,
            durationSeconds: Math.min(30, targetLength.includes("minutes") ? (parseInt(targetLength, 10) || 2) * 60 : (parseInt(targetLength, 10) || 15)),
            style: editStyle,
            onProgress: setRenderProgress
          });
      trackEvolutionEvent("render_success");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${projectName.trim().replace(/[^a-z0-9-_]+/gi, "-") || "dravex-video"}.webm`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(audioClips.length
        ? "Montage exported as WebM with imported background audio mixed in locally. Advanced volume automation, transitions, and MP4 export are still upcoming."
        : videoClips.length
          ? "Video sequence exported as WebM from your trimmed source clips with original audio where supported. Transitions and MP4 export are still upcoming."
          : "Image montage exported as WebM with motion and the selected style. Audio and MP4 export are still upcoming.");
    } catch (error) {
      trackEvolutionEvent("render_failure");
      setNotice(error instanceof Error ? error.message : "Video rendering failed. Try shorter clips or smaller source files.");
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  const saveProject = () => {
    const project = {
      app: "DRAVEX",
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      projectName,
      mode,
      prompt,
      settings: { aspectRatio: aspect, resolution: quality, targetLength },
      media: clips.map(({ id, name, kind, bytes, duration, trimStart, trimEnd }) => ({ id, name, kind, bytes, duration, trimStart, trimEnd })),
      storyboard: plan,
      limitations: "Media files are not embedded. Re-import source files when reopening this project. No finished video render is included."
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${projectName.trim().replace(/[^a-z0-9-_]+/gi, "-") || "dravex-project"}.dravex.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Project settings exported as a .dravex.json file. Source media is not embedded.");
    window.setTimeout(() => setNotice(""), 4500);
  };

  return localize((
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="DRAVEX home">
          <span className="brand-mark"><Aperture size={22} strokeWidth={2.2} /></span>
          <span className="brand-word">DRAVEX<span className="brand-dot">.</span><small>VIDEO STUDIO</small></span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <button className={mode === "ai" ? "nav-item active" : "nav-item"} onClick={() => setMode("ai")} aria-label="AI Creator" title="AI Creator">
          <WandSparkles size={18} /> <span>AI Creator</span><span className="nav-tag">BETA</span>
        </button>
        <button className={mode === "manual" ? "nav-item active" : "nav-item"} onClick={() => setMode("manual")} aria-label="Manual Studio" title="Manual Studio">
          <Clapperboard size={18} /> <span>Manual Studio</span>
        </button>
        <button className={mode === "collab" ? "nav-item active" : "nav-item"} onClick={() => setMode("collab")} aria-label="Collaboration mode" title="Collaboration mode">
          <Sparkles size={18} /> <span>{language === "ru" ? "Совместный режим" : "Collaboration"}</span>
        </button>
        <div className="side-divider" />
        <div className="side-label">PROJECT</div>
        <button className="nav-item" onClick={() => uploadRef.current?.click()} aria-label="Import media" title="Import media"><FolderOpen size={18} /><span>Import media</span></button>
        <button className="nav-item" onClick={saveProject} aria-label="Save project file" title="Save project file"><Download size={18} /><span>Save project file</span></button>
        <div className="sidebar-bottom">
          <div className="privacy-card"><ShieldCheck size={17} /><div><strong>Local-first prototype</strong><span>Your media stays in this browser session.</span></div></div>
          <div className="user-mini"><div className="user-avatar">D</div><div><strong>DRAVEX Studio</strong><span>Early prototype</span></div><Settings2 size={17} /></div>
        </div>
      </aside>

      <main className="main-area" id="home">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><ChevronDown size={14} /><strong>{mode === "ai" ? "AI Creator" : mode === "manual" ? "Manual Studio" : (language === "ru" ? "Совместный режим" : "Collaboration")}</strong><span className="crumb-divider">/</span><input className="project-name-input" aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></div>
          <div className="top-actions"><label className="language-switch"><span className="sr-only">Language</span><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language"><option value="en">English</option><option value="ru">Русский</option></select></label><span className="save-status"><span className="status-dot" /> Session only</span><button className="button button-quiet top-save" onClick={saveProject} aria-label="Save project"><Download size={16} /> Save project</button></div>
        </header>

        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR STORY, YOUR RULES</div>
            <h1>{mode === "ai" ? <>Make something<br /><span>worth watching.</span></> : mode === "manual" ? <>Your timeline.<br /><span>Your creative control.</span></> : <>{language === "ru" ? "Ты и DRAVEX" : "You and DRAVEX"}<br /><span>{language === "ru" ? "в одной команде." : "in one creative team."}</span></>}</h1>
            <p className="welcome-copy">{mode === "ai" ? "Describe the video in your head. Build a plan, bring in your footage, and shape the final cut." : mode === "manual" ? "Work directly with your media. No AI required — you stay in control of every creative decision." : (language === "ru" ? "Создай черновик с помощью ИИ, вручную меняй детали и оставляй только те изменения, которые тебе нравятся." : "Let AI prepare a draft, adjust every detail manually, and keep only the changes you approve.")}</p>
          </div>
          <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><Film size={34} /></div><span className="orbit-star star-a">✳</span><span className="orbit-star star-b">✦</span></div>
        </section>

        <section className="mode-switch" aria-label="Editing mode">
          <button className={mode === "ai" ? "mode-option selected" : "mode-option"} onClick={() => setMode("ai")}><span className="mode-icon ai-icon"><Sparkles size={18} /></span><span><strong>AI Creator</strong><small>Plan with AI assistance</small></span>{mode === "ai" && <Check className="mode-check" size={17} />}</button>
          <button className={mode === "manual" ? "mode-option selected" : "mode-option"} onClick={() => setMode("manual")}><span className="mode-icon manual-icon"><Layers3 size={18} /></span><span><strong>Manual Studio</strong><small>Edit it your way</small></span>{mode === "manual" && <Check className="mode-check" size={17} />}</button>
          <button className={mode === "collab" ? "mode-option selected" : "mode-option"} onClick={() => setMode("collab")}><span className="mode-icon collab-icon"><Heart size={18} /></span><span><strong>{language === "ru" ? "Совместный режим" : "Collaboration"}</strong><small>{language === "ru" ? "ИИ предлагает, ты решаешь" : "AI suggests, you decide"}</small></span>{mode === "collab" && <Check className="mode-check" size={17} />}</button>
        </section>
        {mode === "collab" && <section className="collab-notice panel"><span className="collab-notice-icon"><ShieldCheck size={18} /></span><div><strong>{language === "ru" ? "Режим совместной работы" : "Collaboration mode"}</strong><p>{language === "ru" ? "ИИ-план — только черновик. Проверь его, редактируй клипы вручную и экспортируй результат, когда будешь готов. Принятие каждого предложения остаётся за тобой." : "The AI plan is a draft. Review it, edit clips manually, and export when ready. You stay in control of every proposed change."}</p></div></section>}
        <EvolutionEngine language={language} />

        <section className="reference-lab panel">
          <div className="reference-lab-heading">
            <div><span className="section-kicker">REFERENCE LAB · FIRST STEP</span><h2>Teach DRAVEX with a reference</h2><p>Import a video into the media library, then inspect its pacing and likely cuts.</p></div>
            <span className="reference-lab-icon"><ScanSearch size={20} /></span>
          </div>
          <div className="reference-lab-actions">
            <div className="reference-source"><strong>{clips.find((clip) => clip.kind === "video")?.name ?? "No reference video imported"}</strong><span>{clips.some((clip) => clip.kind === "video") ? "The first imported video will be analyzed locally." : "Use Import to choose a video from your device."}</span></div>
            <button className="button button-primary" onClick={analyzeReference} disabled={isAnalyzingReference || !clips.some((clip) => clip.kind === "video")}>{isAnalyzingReference ? "Analyzing…" : "Analyze reference"} <ArrowRight size={16} /></button>
          </div>
          {referenceReport.length > 0 && <div className="reference-report" aria-live="polite">{referenceReport.map((line, index) => <p key={index}>{line}</p>)}</div>}
          {referenceRecipe && <div className="reference-recipe">
            <div><strong>{language === "ru" ? "РЕЦЕПТ МОНТАЖА" : "EDIT RECIPE"}</strong><p>{language === "ru" ? "DRAVEX превратил найденный темп в практические подсказки для нового ролика." : "DRAVEX has turned the detected pacing into practical guidelines for a new edit."}</p></div>
            <button className="button button-primary" onClick={applyReferenceRecipe}><WandSparkles size={16} /> {language === "ru" ? "Использовать рецепт в плане" : "Use recipe in plan"} <ArrowRight size={15} /></button>
          </div>}
        </section>

        {mode !== "manual" ? (
          <section className="creator-grid">
            <div className="panel prompt-panel">
              <div className="panel-heading"><div><span className="step-number">01</span><div><h2>Describe your video</h2><p>Start with an idea. Be as specific as you like.</p></div></div><span className="panel-icon"><Sparkles size={18} /></span></div>
              <label className="field-label" htmlFor="video-prompt">YOUR CREATIVE BRIEF</label>
              <textarea id="video-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="A cinematic night drive through a neon city, fast cuts synced to the beat, dramatic opening and a powerful finish…" rows={5} />
              <p className="prompt-guidance">Tip: describe the mood, story, and editing style in your prompt.</p>
              <div className="panel-separator" />
              <div className="panel-heading compact"><div><span className="step-number">02</span><div><h2>Set the direction</h2><p>Adjust the output to fit your platform.</p></div></div></div>
              <div className="settings-grid">
                <label className="setting-field"><span>Edit style</span><select value={editStyle} onChange={(event) => setEditStyle(event.target.value as EditStyle)}><option value="velocity">Velocity / Beat Sync</option><option value="anime">Anime / AMV</option><option value="cinematic">Cinematic</option><option value="glitch">Glitch / Cyberpunk</option><option value="story">Clean Storytelling</option></select></label>
                <label className="setting-field"><span>Aspect ratio</span><select value={aspect} onChange={(event) => setAspect(event.target.value)}><option>9:16</option><option>16:9</option><option>1:1</option><option>4:5</option></select></label>
                <label className="setting-field"><span>Target length</span><select value={targetLength} onChange={(event) => setTargetLength(event.target.value)}><option>15 seconds</option><option>30 seconds</option><option>60 seconds</option><option>90 seconds</option><option>2 minutes</option><option>5 minutes</option><option>10+ minutes</option></select></label>
                <label className="setting-field"><span>Output quality</span><select value={quality} onChange={(event) => setQuality(event.target.value)}><option>720p</option><option>1080p</option><option>4K</option></select></label>
              </div>
              <button className="button button-primary create-button" onClick={makePlan}><WandSparkles size={17} /> Build my video plan <ArrowRight size={17} /></button>
              <p className="prototype-note"><ShieldCheck size={14} /> Local planning demo — no external AI model is connected yet.</p>
            </div>

            <div className="panel plan-panel">
              <div className="panel-heading"><div><span className="step-number">03</span><div><h2>Your creative plan</h2><p>A first outline for your next cut.</p></div></div><span className="draft-badge"><span /> DRAFT</span></div>
              {plan.length ? <div className="storyboard">{plan.map((item, index) => <div className="storyboard-item" key={item}><div className="storyboard-thumb">{index === 0 ? <Aperture size={19} /> : index === 3 ? <AudioLines size={19} /> : <Film size={19} />}</div><p>{item}</p></div>)}</div> : <div className="empty-plan"><div className="empty-art"><div className="empty-frame frame-back" /><div className="empty-frame frame-front"><MonitorPlay size={31} /><span>YOUR NEXT IDEA</span></div><span className="spark spark-one">✦</span><span className="spark spark-two">✳</span></div><h3>Your next idea starts here</h3><p>Your outline will appear here after you describe the video and build a plan.</p></div>}
              <div className="plan-footer"><div className="plan-status"><span className="status-ring" /> {plan.length ? "Draft ready to review" : "Waiting for your brief"}</div><span className="plan-meta">{clips.length} media files added</span></div>
              <button className="button button-primary create-button" onClick={renderVideo} disabled={isRendering}>
                <Film size={17} /> {isRendering ? `Rendering video… ${renderProgress}%` : "Create automatic montage"} <ArrowRight size={17} />
              </button>
              <p className="prototype-note"><ShieldCheck size={14} /> Local renderer exports WebM from trimmed video clips, mixed video/image sequences, or image slideshows. Imported audio can be mixed into sequence exports; transitions and MP4 export are still in development.</p>
            </div>
          </section>
        ) : (
          <section className="panel manual-banner">
            <div className="manual-banner-icon"><Clapperboard size={25} /></div><div><h2>Manual Studio</h2><p>Import your clips, choose the order, preview each item, and prepare a project file. More precise timeline tools and finished-video rendering are still being built.</p></div><button className="button button-primary" onClick={() => uploadRef.current?.click()}><Upload size={16} /> Import media</button>
          </section>
        )}

        <section className="media-section">
          <div className="section-title-row"><div><div className="section-kicker">YOUR ASSETS</div><h2>Media library <span className="count-pill">{clips.length}</span></h2></div><button className="button button-outline" onClick={() => uploadRef.current?.click()}><Plus size={17} /> Add media</button></div>
          <input ref={uploadRef} className="visually-hidden" type="file" accept="video/*,audio/*,image/*" multiple onChange={(event) => addFiles(event.target.files)} />
          <div className="media-layout">
            <div className="media-bin panel">
              {clips.length === 0 ? <button className="dropzone" onClick={() => uploadRef.current?.click()}><span className="upload-circle"><Upload size={22} /></span><strong>Drop your media into the story</strong><span>Or tap to browse files on your device</span><span className="file-types">VIDEO · IMAGE · AUDIO</span></button> : <div className="clip-list">{clips.map((clip, index) => <div className={activeClip?.id === clip.id ? "clip-row clip-selected" : "clip-row"} key={clip.id} onClick={() => setActiveId(clip.id)}><div className={`clip-type ${clip.kind}`}>{clip.kind === "audio" ? <Music2 size={18} /> : clip.kind === "image" ? <Aperture size={18} /> : <FileVideo size={18} />}</div><div className="clip-info"><strong title={clip.name}>{clip.name}</strong><span>{clip.kind.toUpperCase()} · {formatBytes(clip.bytes)}{clip.duration ? ` · ${formatTime(clip.duration)}` : ""}</span></div><div className="clip-controls"><button aria-label="Move clip up" title="Move up" onClick={(event) => { event.stopPropagation(); moveClip(clip.id, -1); }} disabled={index === 0}><ArrowUp size={14} /></button><button aria-label="Move clip down" title="Move down" onClick={(event) => { event.stopPropagation(); moveClip(clip.id, 1); }} disabled={index === clips.length - 1}><ArrowDown size={14} /></button><button aria-label="Remove clip" title="Remove" onClick={(event) => { event.stopPropagation(); removeClip(clip.id); }}><Trash2 size={14} /></button></div></div>)}</div>}
              {clips.length > 0 && <div className="media-bin-footer"><span>{clips.length} items · {formatBytes(totalBytes)}</span><button onClick={() => uploadRef.current?.click()}><Plus size={14} /> Add more</button></div>}
            </div>
            <div className="preview-panel panel">
              <div className="preview-head"><span><MonitorPlay size={16} /> PREVIEW</span><span className="preview-resolution">{aspect} · {quality}</span></div>
              <div className={`preview-stage ${aspect === "16:9" ? "landscape" : aspect === "1:1" ? "square" : "portrait"}`}>
                {!activeClip ? <div className="preview-placeholder"><div className="preview-placeholder-icon"><Film size={28} /></div><strong>Your preview lives here</strong><span>Import media to get started.</span></div> : activeClip.kind === "video" ? <video key={activeClip.id} src={activeClip.url} controls playsInline onTimeUpdate={(event) => setPlayheadTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => { const duration = event.currentTarget.duration; setPlayheadTime(event.currentTarget.currentTime); setClips((current) => current.map((clip) => clip.id === activeClip.id ? { ...clip, duration, trimEnd: clip.trimEnd ?? duration, trimStart: clip.trimStart ?? 0 } : clip)); }} /> : activeClip.kind === "image" ? <img src={activeClip.url} alt={activeClip.name} /> : <div className="audio-preview"><span className="audio-visual"><AudioLines size={42} /></span><strong>{activeClip.name}</strong><audio src={activeClip.url} controls /></div>}
              </div>
              {activeClip?.kind === "audio" && <div className="audio-mix-controls">
                <label htmlFor="music-volume"><strong>{language === "ru" ? "ГРОМКОСТЬ ФОНОВОГО АУДИО" : "BACKGROUND AUDIO VOLUME"}</strong><span>{musicVolume}%</span></label>
                <input id="music-volume" type="range" min="0" max="100" step="5" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} />
                <p>{language === "ru" ? "Уровень применяется к импортированным аудиофайлам при экспорте." : "This level is applied to imported audio files during export."}</p>
              </div>}
              {activeClip?.kind === "video" && <div className="trim-controls">
                <div className="trim-controls-heading"><strong>{language === "ru" ? "ОБРЕЗКА КЛИПА" : "CLIP TRIM"}</strong><span>{language === "ru" ? "Секунды" : "Seconds"}</span></div>
                <label><span>{language === "ru" ? "Начало" : "Start"}</span><input type="number" min="0" max={Math.max(0, (activeClip.duration ?? 0) - 0.1)} step="0.1" value={activeClip.trimStart ?? 0} onChange={(event) => {
                  const value = Math.max(0, Math.min(Number(event.target.value) || 0, Math.max(0, (activeClip.duration ?? 0) - 0.1)));
                  setClips((current) => current.map((clip) => clip.id === activeClip.id ? { ...clip, trimStart: value, trimEnd: Math.max(clip.trimEnd ?? clip.duration ?? value + 0.1, value + 0.1) } : clip));
                }} /></label>
                <label><span>{language === "ru" ? "Конец" : "End"}</span><input type="number" min={(activeClip.trimStart ?? 0) + 0.1} max={activeClip.duration ?? undefined} step="0.1" value={activeClip.trimEnd ?? activeClip.duration ?? ""} onChange={(event) => {
                  const value = Number(event.target.value);
                  setClips((current) => current.map((clip) => clip.id === activeClip.id ? { ...clip, trimEnd: Number.isFinite(value) && value > (clip.trimStart ?? 0) ? Math.min(value, clip.duration ?? value) : clip.trimEnd } : clip));
                }} />
                </label>
                <span className="trim-duration">{formatTime(Math.max(0, (activeClip.trimEnd ?? activeClip.duration ?? 0) - (activeClip.trimStart ?? 0)))} {language === "ru" ? "выбрано" : "selected"}</span>
                <button className="button button-quiet split-clip-button" onClick={splitClipAtPlayhead} disabled={!activeClip.duration || playheadTime <= (activeClip.trimStart ?? 0) + 0.1 || playheadTime >= (activeClip.trimEnd ?? activeClip.duration) - 0.1}><Aperture size={14} />{language === "ru" ? "Разделить по позиции" : "Split at playhead"}</button>
              </div>}
              <div className="preview-footer"><span>{activeClip ? activeClip.name : "No media selected"}</span><span>{videoCount} video{videoCount === 1 ? "" : "s"} · {formatTime(estimatedDuration)} known duration</span></div>
            </div>
          </div>
        </section>

        <section className="timeline-section panel">
          <div className="timeline-heading"><div><span className="section-kicker">EDITING WORKSPACE</span><h2>Timeline <span className="soon-badge">FOUNDATION</span></h2></div><div className="timeline-actions"><span className="timeline-length"><Gauge size={15} /> {formatTime(estimatedDuration)}</span><button className="button button-quiet" onClick={saveProject}><Download size={16} /> Export project</button></div></div>
          {clips.length ? <div className="timeline-tracks"><div className="track-label"><Film size={15} /> MEDIA</div><div className="track-items">{clips.map((clip, index) => <div key={clip.id} className={activeClip?.id === clip.id ? "track-clip-card selected" : "track-clip-card"}>
                <button className="track-clip-select" onClick={() => setActiveId(clip.id)} aria-label={`Select ${clip.name}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span><strong>{clip.name}</strong><small>{clip.kind.toUpperCase()}</small>
                  {clip.kind === "video" && clip.duration ? <small>{formatTime(Math.max(0, Math.min(clip.duration, clip.trimEnd ?? clip.duration) - Math.max(0, clip.trimStart ?? 0)))}</small> : null}
                </button>
                <div className="track-clip-actions">
                  <button onClick={() => moveClip(clip.id, -1)} disabled={index === 0} aria-label={language === "ru" ? "Переместить клип выше" : "Move clip earlier"} title={language === "ru" ? "Выше" : "Move earlier"}><ArrowUp size={13} /></button>
                  <button onClick={() => moveClip(clip.id, 1)} disabled={index === clips.length - 1} aria-label={language === "ru" ? "Переместить клип ниже" : "Move clip later"} title={language === "ru" ? "Ниже" : "Move later"}><ArrowDown size={13} /></button>
                </div>
              </div>)}</div></div> : <div className="timeline-empty"><span className="timeline-empty-icon"><Layers3 size={18} /></span><div><strong>Your timeline is ready</strong><p>Add media to start building your sequence.</p></div><button className="button button-quiet" onClick={() => uploadRef.current?.click()}>Add first clip <ArrowRight size={15} /></button></div>}
          <div className="timeline-note"><span className="note-mark">i</span> This build supports clip trimming and local WebM sequence export with original video audio where supported. Imported audio mixing is available; transitions, MP4 export, and connected AI generation are still in development.</div>
        </section>

        <footer className="app-footer"><span>DRAVEX <span className="footer-dot">●</span> BUILDING THE FUTURE OF VIDEO</span><span><ShieldCheck size={14} /> Your choice. Your workflow.</span></footer>
      </main>
      <nav className="mobile-nav" aria-label="Main navigation">
        <button className={mode === "ai" ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => setMode("ai")} aria-label="AI Creator">
          <WandSparkles size={19} /><span>{language === "ru" ? "ИИ" : "AI"}</span>
        </button>
        <button className={mode === "manual" ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => setMode("manual")} aria-label="Manual Studio">
          <Layers3 size={19} /><span>{language === "ru" ? "Студия" : "Studio"}</span>
        </button>
        <button className="mobile-nav-item" onClick={() => uploadRef.current?.click()} aria-label="Import media">
          <Upload size={19} /><span>{language === "ru" ? "Импорт" : "Import"}</span>
        </button>
        <button className="mobile-nav-item" onClick={saveProject} aria-label="Save project">
          <Download size={19} /><span>{language === "ru" ? "Сохранить" : "Save"}</span>
        </button>
      </nav>
      {notice && <div className="toast" role="status"><Check size={16} /> {notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15} /></button></div>}
    </div>
  ), language);
}
