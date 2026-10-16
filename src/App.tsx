import { cloneElement, isValidElement, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { renderImageSlideshow } from "./video/local-render";
import {
  Aperture, ArrowDown, ArrowRight, ArrowUp, AudioLines, Check,
  ChevronDown, Clapperboard, Download, FileVideo, Film, FolderOpen, Gauge,
  Layers3, MonitorPlay, Music2, Plus, Settings2,
  ShieldCheck, Sparkles, Trash2, Upload, WandSparkles, X
} from "lucide-react";


type Language = "en" | "ru";
const russianText: Record<string, string> = {"WORKSPACE":"РАБОЧЕЕ ПРОСТРАНСТВО","PROJECT":"ПРОЕКТ","Import media":"Импортировать медиа","Save project file":"Сохранить файл проекта","Local-first prototype":"Локальный прототип","Your media stays in this browser session.":"Ваши медиафайлы остаются в текущем сеансе браузера.","Early prototype":"Ранний прототип","Session only":"Только текущий сеанс","Save project":"Сохранить проект","YOUR STORY, YOUR RULES":"ТВОЯ ИСТОРИЯ — ТВОИ ПРАВИЛА","Make something":"Создай нечто","worth watching.":"Достойное просмотра.","Your timeline.":"Твоя монтажная шкала.","Your creative control.":"Твой творческий контроль.","Describe the video in your head. Build a plan, bring in your footage, and shape the final cut.":"Опиши видео, которое представляешь. Составь план, добавь материалы и создай финальный монтаж.","Work directly with your media. No AI required — you stay in control of every creative decision.":"Работай напрямую со своими материалами. ИИ не обязателен — каждое творческое решение остаётся за тобой.","Plan with AI assistance":"Планирование с помощью ИИ","Edit it your way":"Монтируй по-своему","Describe your video":"Опиши своё видео","Start with an idea. Be as specific as you like.":"Начни с идеи. Чем подробнее, тем лучше.","YOUR CREATIVE BRIEF":"ТВОЯ ИДЕЯ","A cinematic night drive through a neon city, fast cuts synced to the beat, dramatic opening and a powerful finish…":"Кинематографичная ночная поездка по неоновому городу, быстрый монтаж в ритм музыки, драматичное начало и мощный финал…","Mood":"Настроение","Story":"История","Editing style":"Стиль монтажа","Set the direction":"Настрой видео","Adjust the output to fit your platform.":"Настрой результат под свою платформу.","Aspect ratio":"Соотношение сторон","Target length":"Длительность","Output quality":"Качество видео","Build my video plan":"Создать план видео","Local planning demo — no external AI model is connected yet.":"Локальная демонстрация планирования — внешняя модель ИИ пока не подключена.","Your creative plan":"Твой план видео","A first outline for your next cut.":"Первый набросок будущего ролика.","DRAFT":"ЧЕРНОВИК","YOUR NEXT IDEA":"ТВОЯ СЛЕДУЮЩАЯ ИДЕЯ","Your next idea starts here":"Твоя следующая идея начинается здесь","Your outline will appear here after you describe the video and build a plan.":"Здесь появится план после того, как ты опишешь видео и создашь план.","Waiting for your brief":"Ожидаем твою идею","Draft ready to review":"Черновик готов к просмотру","Render 15-second video":"Создать видео на 15 секунд","First renderer exports WebM from imported images directly on this device. MP4, audio, and video-clip rendering are not included yet.":"Первая версия создаёт WebM из изображений прямо на устройстве. Экспорт MP4, звук и обработка видеоклипов пока не поддерживаются.","YOUR ASSETS":"ТВОИ МАТЕРИАЛЫ","Media library":"Медиатека","Add media":"Добавить медиа","Drop your media into the story":"Добавь материалы в проект","Or tap to browse files on your device":"Или нажми, чтобы выбрать файлы на устройстве","VIDEO · IMAGE · AUDIO":"ВИДЕО · ИЗОБРАЖЕНИЯ · АУДИО","PREVIEW":"ПРЕДПРОСМОТР","Your preview lives here":"Здесь будет предпросмотр","Import media to get started.":"Импортируй файлы, чтобы начать.","No media selected":"Медиа не выбраны","EDITING WORKSPACE":"МОНТАЖНОЕ ПРОСТРАНСТВО","Timeline":"Монтажная шкала","FOUNDATION":"ОСНОВА","Export project":"Экспорт проекта","Your timeline is ready":"Монтажная шкала готова","Add media to start building your sequence.":"Добавь медиафайлы, чтобы начать собирать последовательность.","Add first clip":"Добавить первый клип","This build can organize and preview media and save project settings. Trimming, transitions, rendered MP4 export, and connected AI generation are not implemented yet.":"Эта версия умеет упорядочивать и просматривать медиа, а также сохранять настройки проекта. Обрезка, переходы, экспорт готового MP4 и подключение ИИ пока не реализованы.","BUILDING THE FUTURE OF VIDEO":"СОЗДАЁМ БУДУЩЕЕ ВИДЕО","Your choice. Your workflow.":"Твой выбор. Твой рабочий процесс.","Dismiss message":"Закрыть сообщение","Add more":"Добавить ещё","Move clip up":"Переместить клип вверх","Move clip down":"Переместить клип вниз","Remove clip":"Удалить клип","Move up":"Вверх","Move down":"Вниз","Remove":"Удалить","MEDIA":"МЕДИА","BETA":"БЕТА","Describe the video you want to make first.":"Сначала опиши видео, которое хочешь создать.","Draft plan created locally. This is a planning preview, not a rendered video.":"Черновой план создан локально. Это предварительный план, а не готовое видео.","Add at least one image to render a short video. Video-clip rendering is coming later.":"Добавь хотя бы одно изображение, чтобы создать короткое видео. Обработка видеоклипов появится позже.","Rendering a short video locally in your browser…":"Создаём короткое видео прямо в браузере…","Video rendered and downloaded as WebM. This first local renderer uses images, motion, and a title; audio and MP4 export are next steps.":"Видео создано и скачано в формате WebM. Эта версия использует изображения, движение и заголовок; звук и экспорт MP4 добавим позже.","Video rendering failed. Please try fewer or smaller images.":"Не удалось создать видео. Попробуй использовать меньше изображений или файлы меньшего размера.","Project settings exported as a .dravex.json file. Source media is not embedded.":"Настройки проекта экспортированы в файл .dravex.json. Исходные медиафайлы в него не включены.","Choose a video, image, or audio file.":"Выбери видео, изображение или аудиофайл.","Import your clips, choose the order, preview each item, and prepare a project file. More precise timeline tools and finished-video rendering are still being built.":"Импортируй клипы, выбери их порядок, просмотри каждый файл и подготовь файл проекта. Точные инструменты монтажа и экспорт готового видео ещё разрабатываются.","Language":"Язык","Edit style":"Стиль монтажа","Velocity / Beat Sync":"Velocity / в ритм музыки","Anime / AMV":"Аниме / AMV","Cinematic":"Кинематографичный","Glitch / Cyberpunk":"Глитч / киберпанк","Clean Storytelling":"Чистое повествование","02 · VISUALS — Pick the strongest action shots and build speed ramps into key moments.":"02 · ВИЗУАЛ — Выбери самые сильные экшен-кадры и добавь ускорения в ключевых моментах.","03 · RHYTHM — Cut on the beat; alternate quick bursts with short slow-motion accents.":"03 · РИТМ — Режь в такт музыке, чередуя быстрые фрагменты с короткими замедлениями.","05 · FINISH — Save the biggest reveal for the music drop and end on a clean loop.":"05 · ФИНАЛ — Прибереги главный момент для музыкального дропа и закончи плавной зацикленной сценой.","02 · VISUALS — Frame the hero clearly; use close-ups, impact poses, and dramatic contrast.":"02 · ВИЗУАЛ — Чётко покажи героя: используй крупные планы, эффектные позы и драматичный контраст.","03 · RHYTHM — Use fast motion cuts, brief impact flashes, shake, and whoosh accents sparingly.":"03 · РИТМ — Используй быстрые склейки по движению, короткие вспышки, тряску и звуки ударов умеренно.","05 · FINISH — Build toward one signature hero moment, then finish with a strong freeze-frame.":"05 · ФИНАЛ — Подведи монтаж к главному моменту героя и заверши выразительным стоп-кадром.","02 · VISUALS — Establish the scene, then use deliberate close-ups and controlled movement.":"02 · ВИЗУАЛ — Сначала покажи обстановку, затем добавь осмысленные крупные планы и плавное движение.","03 · RHYTHM — Let emotional shots breathe; use smooth zooms and only a few purposeful cuts.":"03 · РИТМ — Дай эмоциональным кадрам раскрыться; используй плавные приближения и немного точных склеек.","05 · FINISH — Resolve the story with a memorable final frame and a gentle fade.":"05 · ФИНАЛ — Заверши историю запоминающимся кадром и мягким затемнением.","02 · VISUALS — Use bold silhouettes, neon contrast, and clean focal points for each shot.":"02 · ВИЗУАЛ — Используй выразительные силуэты, неоновый контраст и чёткий центр внимания.","03 · RHYTHM — Place brief glitch or RGB-split accents on selected beats, not every cut.":"03 · РИТМ — Добавляй короткие глитч-эффекты и RGB-смещение на отдельных ударах, а не при каждой склейке.","05 · FINISH — Hit one controlled digital distortion at the climax, then return to a crisp image.":"05 · ФИНАЛ — Добавь один цифровой сбой в кульминации и вернись к чёткому изображению.","02 · VISUALS — Choose readable shots that clearly show the subject and what is happening.":"02 · ВИЗУАЛ — Выбирай понятные кадры, где хорошо видны герой и происходящее.","03 · RHYTHM — Keep cuts purposeful, captions short, and the story easy to follow without sound.":"03 · РИТМ — Делай осмысленные склейки, короткие подписи и понятную историю даже без звука.","05 · FINISH — Deliver a clear payoff and finish before the idea starts to feel repetitive.":"05 · ФИНАЛ — Дай зрителю понятную развязку и закончи до того, как монтаж начнёт повторяться.","Choose music that matches the edit rhythm; generated audio is not available yet.":"Подбери музыку под ритм монтажа; генерация звука пока недоступна."};
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

type Mode = "ai" | "manual";
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
type MediaClip = {
  id: string;
  name: string;
  kind: ClipKind;
  url: string;
  bytes: number;
  duration?: number;
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
  const uploadRef = useRef<HTMLInputElement>(null);

  const activeClip = clips.find((clip) => clip.id === activeId) ?? clips[0] ?? null;
  const videoCount = clips.filter((clip) => clip.kind === "video").length;
  const totalBytes = clips.reduce((sum, clip) => sum + clip.bytes, 0);
  const estimatedDuration = useMemo(
    () => clips.reduce((sum, clip) => sum + (clip.duration ?? 0), 0),
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
    if (!activeId && newClips[0]) setActiveId(newClips[0].id);
    setNotice(newClips.length ? `Added ${newClips.length} media file${newClips.length === 1 ? "" : "s"} to this session.` : "Choose a video, image, or audio file.");
    window.setTimeout(() => setNotice(""), 4000);
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const removeClip = (id: string) => {
    const clip = clips.find((item) => item.id === id);
    if (clip) URL.revokeObjectURL(clip.url);
    const next = clips.filter((item) => item.id !== id);
    setClips(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const moveClip = (id: string, direction: -1 | 1) => {
    setClips((current) => {
      const index = current.findIndex((clip) => clip.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const makePlan = () => {
    if (!prompt.trim()) {
      setNotice("Describe the video you want to make first.");
      window.setTimeout(() => setNotice(""), 3500);
      return;
    }
    const idea = prompt.trim().replace(/[.!?]+$/, "");
    const hasAudio = clips.some((clip) => clip.kind === "audio");
    const recipe = editRecipes[editStyle];
    const next = [
      `01 · OPEN — Start with a clear visual hook for “${idea}”.`,
      recipe.visuals,
      recipe.rhythm,
      hasAudio ? "04 · SOUND — Review the imported audio and keep dialogue understandable." : "04 · SOUND — Choose music that matches the edit rhythm; generated audio is not available yet.",
      recipe.finish
    ];
    setPlan(next);
    setNotice("Draft plan created locally. This is a planning preview, not a rendered video.");
    window.setTimeout(() => setNotice(""), 5000);
  };

  const renderVideo = async () => {
    const images = clips.filter((clip) => clip.kind === "image").map(({ name, url }) => ({ name, url }));
    if (!images.length) {
      setNotice("Add at least one image to render a short video. Video-clip rendering is coming later.");
      window.setTimeout(() => setNotice(""), 5000);
      return;
    }
    setIsRendering(true);
    setRenderProgress(0);
    setNotice("Rendering a short video locally in your browser…");
    try {
      const blob = await renderImageSlideshow({
        images,
        title: prompt || projectName,
        aspectRatio: aspect,
        durationSeconds: 15,
        onProgress: setRenderProgress
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${projectName.trim().replace(/[^a-z0-9-_]+/gi, "-") || "dravex-video"}.webm`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Video rendered and downloaded as WebM. This first local renderer uses images, motion, and a title; audio and MP4 export are next steps.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Video rendering failed. Please try fewer or smaller images.");
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
      media: clips.map(({ id, name, kind, bytes, duration }) => ({ id, name, kind, bytes, duration })),
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
        <button className={mode === "ai" ? "nav-item active" : "nav-item"} onClick={() => setMode("ai")}>
          <WandSparkles size={18} /> <span>AI Creator</span><span className="nav-tag">BETA</span>
        </button>
        <button className={mode === "manual" ? "nav-item active" : "nav-item"} onClick={() => setMode("manual")}>
          <Clapperboard size={18} /> <span>Manual Studio</span>
        </button>
        <div className="side-divider" />
        <div className="side-label">PROJECT</div>
        <button className="nav-item" onClick={() => uploadRef.current?.click()}><FolderOpen size={18} /><span>Import media</span></button>
        <button className="nav-item" onClick={saveProject}><Download size={18} /><span>Save project file</span></button>
        <div className="sidebar-bottom">
          <div className="privacy-card"><ShieldCheck size={17} /><div><strong>Local-first prototype</strong><span>Your media stays in this browser session.</span></div></div>
          <div className="user-mini"><div className="user-avatar">D</div><div><strong>DRAVEX Studio</strong><span>Early prototype</span></div><Settings2 size={17} /></div>
        </div>
      </aside>

      <main className="main-area" id="home">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><ChevronDown size={14} /><strong>{mode === "ai" ? "AI Creator" : "Manual Studio"}</strong><span className="crumb-divider">/</span><input className="project-name-input" aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></div>
          <div className="top-actions"><label className="language-switch"><span className="sr-only">Language</span><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language"><option value="en">English</option><option value="ru">Русский</option></select></label><span className="save-status"><span className="status-dot" /> Session only</span><button className="button button-quiet top-save" onClick={saveProject}><Download size={16} /> Save project</button></div>
        </header>

        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR STORY, YOUR RULES</div>
            <h1>{mode === "ai" ? <>Make something<br /><span>worth watching.</span></> : <>Your timeline.<br /><span>Your creative control.</span></>}</h1>
            <p className="welcome-copy">{mode === "ai" ? "Describe the video in your head. Build a plan, bring in your footage, and shape the final cut." : "Work directly with your media. No AI required — you stay in control of every creative decision."}</p>
          </div>
          <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><Film size={34} /></div><span className="orbit-star star-a">✳</span><span className="orbit-star star-b">✦</span></div>
        </section>

        <section className="mode-switch" aria-label="Editing mode">
          <button className={mode === "ai" ? "mode-option selected" : "mode-option"} onClick={() => setMode("ai")}><span className="mode-icon ai-icon"><Sparkles size={18} /></span><span><strong>AI Creator</strong><small>Plan with AI assistance</small></span>{mode === "ai" && <Check className="mode-check" size={17} />}</button>
          <button className={mode === "manual" ? "mode-option selected" : "mode-option"} onClick={() => setMode("manual")}><span className="mode-icon manual-icon"><Layers3 size={18} /></span><span><strong>Manual Studio</strong><small>Edit it your way</small></span>{mode === "manual" && <Check className="mode-check" size={17} />}</button>
        </section>

        {mode === "ai" ? (
          <section className="creator-grid">
            <div className="panel prompt-panel">
              <div className="panel-heading"><div><span className="step-number">01</span><div><h2>Describe your video</h2><p>Start with an idea. Be as specific as you like.</p></div></div><span className="panel-icon"><Sparkles size={18} /></span></div>
              <label className="field-label" htmlFor="video-prompt">YOUR CREATIVE BRIEF</label>
              <textarea id="video-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="A cinematic night drive through a neon city, fast cuts synced to the beat, dramatic opening and a powerful finish…" rows={5} />
              <div className="prompt-hints"><span><span className="hint-dot" /> Mood</span><span><span className="hint-dot" /> Story</span><span><span className="hint-dot" /> Editing style</span></div>
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
                <Film size={17} /> {isRendering ? `Rendering video… ${renderProgress}%` : "Render 15-second video"} <ArrowRight size={17} />
              </button>
              <p className="prototype-note"><ShieldCheck size={14} /> First renderer exports WebM from imported images directly on this device. MP4, audio, and video-clip rendering are not included yet.</p>
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
                {!activeClip ? <div className="preview-placeholder"><div className="preview-placeholder-icon"><Film size={28} /></div><strong>Your preview lives here</strong><span>Import media to get started.</span></div> : activeClip.kind === "video" ? <video key={activeClip.id} src={activeClip.url} controls playsInline onLoadedMetadata={(event) => { const duration = event.currentTarget.duration; setClips((current) => current.map((clip) => clip.id === activeClip.id ? { ...clip, duration } : clip)); }} /> : activeClip.kind === "image" ? <img src={activeClip.url} alt={activeClip.name} /> : <div className="audio-preview"><span className="audio-visual"><AudioLines size={42} /></span><strong>{activeClip.name}</strong><audio src={activeClip.url} controls /></div>}
              </div>
              <div className="preview-footer"><span>{activeClip ? activeClip.name : "No media selected"}</span><span>{videoCount} video{videoCount === 1 ? "" : "s"} · {formatTime(estimatedDuration)} known duration</span></div>
            </div>
          </div>
        </section>

        <section className="timeline-section panel">
          <div className="timeline-heading"><div><span className="section-kicker">EDITING WORKSPACE</span><h2>Timeline <span className="soon-badge">FOUNDATION</span></h2></div><div className="timeline-actions"><span className="timeline-length"><Gauge size={15} /> {formatTime(estimatedDuration)}</span><button className="button button-quiet" onClick={saveProject}><Download size={16} /> Export project</button></div></div>
          {clips.length ? <div className="timeline-tracks"><div className="track-label"><Film size={15} /> MEDIA</div><div className="track-items">{clips.map((clip, index) => <button key={clip.id} className={activeClip?.id === clip.id ? "track-clip selected" : "track-clip"} onClick={() => setActiveId(clip.id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{clip.name}</strong><small>{clip.kind.toUpperCase()}</small></button>)}</div></div> : <div className="timeline-empty"><span className="timeline-empty-icon"><Layers3 size={18} /></span><div><strong>Your timeline is ready</strong><p>Add media to start building your sequence.</p></div><button className="button button-quiet" onClick={() => uploadRef.current?.click()}>Add first clip <ArrowRight size={15} /></button></div>}
          <div className="timeline-note"><span className="note-mark">i</span> This build can organize and preview media and save project settings. Trimming, transitions, rendered MP4 export, and connected AI generation are not implemented yet.</div>
        </section>

        <footer className="app-footer"><span>DRAVEX <span className="footer-dot">●</span> BUILDING THE FUTURE OF VIDEO</span><span><ShieldCheck size={14} /> Your choice. Your workflow.</span></footer>
      </main>
      {notice && <div className="toast" role="status"><Check size={16} /> {notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15} /></button></div>}
    </div>
  ), language);
}
