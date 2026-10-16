import { useEffect, useRef, useState } from "react";
import { Download, Film, Play, Sparkles, Video } from "lucide-react";

type Language = "en" | "ru";
type VideoKind = "overview" | "guide";

type Scene = { title: string; subtitle: string; tag: string; visual: "brand" | "prompt" | "media" | "highlights" | "timeline" | "export" };

const copy: Record<Language, Record<VideoKind, Scene[]>> = {
  ru: {
    overview: [
      { tag: "ЗНАКОМЬСЯ С ПРОЕКТОМ", title: "DRAVEX", subtitle: "Твоя идея. Твой видеомонтаж.", visual: "brand" },
      { tag: "ШАГ 01 · ИДЕЯ", title: "Начни с идеи", subtitle: "Опиши настроение и стиль ролика в AI Creator.", visual: "prompt" },
      { tag: "ШАГ 02 · МАТЕРИАЛЫ", title: "Добавь свои кадры", subtitle: "Импортируй видео, изображения и собери основу истории.", visual: "media" },
      { tag: "ШАГ 03 · АВТОМОНТАЖ", title: "Найди лучшие моменты", subtitle: "Auto Highlight Director предлагает варианты темпа по визуальным изменениям.", visual: "highlights" },
      { tag: "ШАГ 04 · КОНТРОЛЬ", title: "Сохрани творческий контроль", subtitle: "Проверь клипы, порядок и обрезку на монтажной шкале.", visual: "timeline" },
      { tag: "DRAVEX · VIDEO STUDIO", title: "От идеи — к видео", subtitle: "Создавай, проверяй и дорабатывай результат на своём устройстве.", visual: "export" },
    ],
    guide: [
      { tag: "ИНСТРУКЦИЯ · DRAVEX", title: "Как пользоваться DRAVEX", subtitle: "Короткое руководство для первого запуска.", visual: "brand" },
      { tag: "ШАГ 01", title: "Выбери режим", subtitle: "AI Creator помогает подготовить план, Manual Studio — работать с медиа вручную.", visual: "prompt" },
      { tag: "ШАГ 02", title: "Импортируй файлы", subtitle: "Нажми Import media и выбери видео или изображения на телефоне.", visual: "media" },
      { tag: "ШАГ 03", title: "Подготовь монтаж", subtitle: "Для видео попробуй Auto Highlight Director и выбери подходящий вариант.", visual: "highlights" },
      { tag: "ШАГ 04", title: "Проверь шкалу", subtitle: "Переставь клипы, настрой обрезку и убедись, что последовательность верна.", visual: "timeline" },
      { tag: "ШАГ 05 · ЭКСПОРТ", title: "Создай и проверь результат", subtitle: "Запусти экспорт и сохрани WebM. На телефоне начни с умеренного разрешения.", visual: "export" },
    ],
  },
  en: {
    overview: [
      { tag: "MEET THE PROJECT", title: "DRAVEX", subtitle: "Your idea. Your video edit.", visual: "brand" },
      { tag: "STEP 01 · IDEA", title: "Start with an idea", subtitle: "Describe the mood and editing style in AI Creator.", visual: "prompt" },
      { tag: "STEP 02 · MEDIA", title: "Bring in your footage", subtitle: "Import videos and images to build the foundation of your story.", visual: "media" },
      { tag: "STEP 03 · AUTO EDIT", title: "Find standout moments", subtitle: "Auto Highlight Director suggests pacing options from visual changes.", visual: "highlights" },
      { tag: "STEP 04 · CONTROL", title: "Keep creative control", subtitle: "Review clips, ordering, and trims on the timeline.", visual: "timeline" },
      { tag: "DRAVEX · VIDEO STUDIO", title: "From idea to video", subtitle: "Create, review, and refine your result on your own device.", visual: "export" },
    ],
    guide: [
      { tag: "DRAVEX · QUICK GUIDE", title: "How to use DRAVEX", subtitle: "A short guide for your first session.", visual: "brand" },
      { tag: "STEP 01", title: "Choose a workspace", subtitle: "AI Creator helps plan a video; Manual Studio is for hands-on editing.", visual: "prompt" },
      { tag: "STEP 02", title: "Import your media", subtitle: "Tap Import media and choose videos or images from your phone.", visual: "media" },
      { tag: "STEP 03", title: "Prepare your edit", subtitle: "Try Auto Highlight Director on a video and select a suggested cut.", visual: "highlights" },
      { tag: "STEP 04", title: "Review the timeline", subtitle: "Reorder clips, adjust trims, and check the sequence.", visual: "timeline" },
      { tag: "STEP 05 · EXPORT", title: "Render and review", subtitle: "Export your result as WebM. Start with a moderate resolution on mobile.", visual: "export" },
    ],
  },
};

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3) {
  const words = text.split(" ");
  let line = "";
  let row = 0;
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      row += 1;
      line = word;
      if (row >= maxLines) return;
    } else line = next;
  }
  if (line && row < maxLines) ctx.fillText(line, x, y + row * lineHeight);
}

function drawScene(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, index: number, phase: number, language: Language) {
  const scale = width / 720;
  ctx.save();
  ctx.scale(scale, scale);
  const w = 720;
  const h = height / scale;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0b0d14");
  bg.addColorStop(0.58, index % 2 ? "#151529" : "#102019");
  bg.addColorStop(1, "#08090e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#b5f36d";
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(575, 170, 65 + i * 28 + Math.sin(phase * Math.PI * 2) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#b5f36d";
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillText("DRAVEX  /  VIDEO STUDIO", 42, 55);
  ctx.fillStyle = "#7e8398";
  ctx.font = "600 12px Arial, sans-serif";
  ctx.fillText(scene.tag, 42, h * 0.19);
  const titleSize = scene.title.length > 24 ? 38 : 48;
  ctx.fillStyle = "#f5f6fb";
  ctx.font = `800 ${titleSize}px Arial, sans-serif`;
  drawWrapped(ctx, scene.title, 42, h * 0.19 + 58, 620, titleSize + 7, 2);
  ctx.fillStyle = "#aeb3c5";
  ctx.font = "400 22px Arial, sans-serif";
  drawWrapped(ctx, scene.subtitle, 42, h * 0.19 + 145, 600, 32, 3);

  const cardY = h * 0.48 + Math.sin(phase * Math.PI * 2) * 8;
  const cardX = 42 + Math.sin(phase * Math.PI) * 4;
  const cardW = 636;
  const cardH = Math.min(370, h * 0.31);
  roundedRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.fillStyle = "#151823";
  ctx.fill();
  ctx.strokeStyle = "#303447";
  ctx.lineWidth = 2;
  ctx.stroke();
  const left = cardX + 24;
  const top = cardY + 24;
  const innerW = cardW - 48;
  const bar = (y: number, widthPct: number, color = "#34394a") => {
    roundedRect(ctx, left, y, innerW * widthPct, 13, 6);
    ctx.fillStyle = color;
    ctx.fill();
  };

  if (scene.visual === "brand") {
    roundedRect(ctx, left + innerW * 0.32, top + 16, innerW * 0.36, innerW * 0.36, 30);
    ctx.fillStyle = "#b5f36d";
    ctx.fill();
    ctx.fillStyle = "#10130c";
    ctx.font = "800 46px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("D", left + innerW * 0.5, top + 112);
    ctx.textAlign = "left";
    ctx.fillStyle = "#f5f6fb";
    ctx.font = "700 24px Arial, sans-serif";
    ctx.fillText(language === "ru" ? "ТВОЯ ТВОРЧЕСКАЯ СТУДИЯ" : "YOUR CREATIVE STUDIO", left + 30, top + 205);
    bar(top + 235, 0.72, "#596044");
    bar(top + 261, 0.48);
  } else if (scene.visual === "prompt") {
    ctx.fillStyle = "#858ba1";
    ctx.font = "600 14px Arial, sans-serif";
    ctx.fillText(language === "ru" ? "ТВОЯ ИДЕЯ" : "YOUR CREATIVE BRIEF", left, top + 8);
    roundedRect(ctx, left, top + 24, innerW, 90, 12);
    ctx.fillStyle = "#0d0f16";
    ctx.fill();
    ctx.fillStyle = "#dce0eb";
    ctx.font = "18px Arial, sans-serif";
    drawWrapped(ctx, language === "ru" ? "Кинематографичный ролик с выразительными кадрами и плавными приближениями..." : "A cinematic video with expressive shots and smooth camera movement...", left + 16, top + 58, innerW - 32, 25, 2);
    bar(top + 145, 0.42, "#b5f36d");
    bar(top + 174, 0.86);
    bar(top + 202, 0.67);
    bar(top + 230, 0.52);
  } else if (scene.visual === "media") {
    for (let i = 0; i < 3; i++) {
      const x = left + i * (innerW / 3 + 0);
      const tileW = innerW / 3 - 12;
      roundedRect(ctx, x, top + 12, tileW, 135, 12);
      ctx.fillStyle = ["#263a35", "#292b45", "#44303d"][i];
      ctx.fill();
      ctx.strokeStyle = ["#719d7b", "#8583c9", "#c07a92"][i];
      ctx.stroke();
      ctx.fillStyle = "#f3f4fa";
      ctx.font = "700 16px Arial, sans-serif";
      ctx.fillText([language === "ru" ? "ВИДЕО" : "VIDEO", language === "ru" ? "КАДРЫ" : "FRAMES", language === "ru" ? "АУДИО" : "AUDIO"][i], x + 12, top + 176);
    }
    bar(top + 207, 0.9);
    bar(top + 235, 0.58, "#b5f36d");
  } else if (scene.visual === "highlights") {
    ctx.fillStyle = "#b5f36d";
    ctx.font = "700 18px Arial, sans-serif";
    ctx.fillText(language === "ru" ? "AUTO HIGHLIGHT DIRECTOR" : "AUTO HIGHLIGHT DIRECTOR", left, top + 12);
    ["AGGRESSIVE", "CINEMATIC", "ATMOSPHERIC"].forEach((label, i) => {
      const y = top + 35 + i * 68;
      roundedRect(ctx, left, y, innerW, 55, 10);
      ctx.fillStyle = i === 1 ? "#283525" : "#202330";
      ctx.fill();
      ctx.strokeStyle = i === 1 ? "#b5f36d" : "#373b4d";
      ctx.stroke();
      ctx.fillStyle = "#f0f1f7";
      ctx.font = "700 16px Arial, sans-serif";
      ctx.fillText(label, left + 15, y + 23);
      ctx.fillStyle = "#858ba0";
      ctx.font = "13px Arial, sans-serif";
      ctx.fillText(language === "ru" ? "Черновой вариант монтажа" : "Draft edit option", left + 15, y + 42);
      ctx.fillStyle = "#b5f36d";
      ctx.fillRect(left + innerW - 62, y + 17, 42, 20);
    });
  } else if (scene.visual === "timeline") {
    ctx.fillStyle = "#a9aec1";
    ctx.font = "600 14px Arial, sans-serif";
    ctx.fillText(language === "ru" ? "МОНТАЖНАЯ ШКАЛА" : "EDITING TIMELINE", left, top + 10);
    for (let row = 0; row < 3; row++) {
      const y = top + 32 + row * 62;
      ctx.fillStyle = "#8a8fa3";
      ctx.font = "12px Arial, sans-serif";
      ctx.fillText(["01", "02", "03"][row], left, y + 24);
      for (let i = 0; i < 4; i++) {
        const x = left + 38 + i * 128 + (row === 1 ? 24 : 0);
        roundedRect(ctx, x, y, 110, 43, 7);
        ctx.fillStyle = ["#354d45", "#34344d", "#5a3b4a", "#4b4b36"][(i + row) % 4];
        ctx.fill();
      }
    }
    ctx.strokeStyle = "#b5f36d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left + 245 + phase * 130, top + 22);
    ctx.lineTo(left + 245 + phase * 130, top + 220);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#b5f36d";
    ctx.font = "700 19px Arial, sans-serif";
    ctx.fillText(language === "ru" ? "ГОТОВО К ПРОСМОТРУ" : "READY TO REVIEW", left, top + 18);
    bar(top + 43, 0.91, "#465a3b");
    bar(top + 74, 0.72);
    roundedRect(ctx, left, top + 108, innerW * 0.48, 55, 12);
    ctx.fillStyle = "#b5f36d";
    ctx.fill();
    ctx.fillStyle = "#11150d";
    ctx.font = "700 17px Arial, sans-serif";
    ctx.fillText(language === "ru" ? "ЭКСПОРТ WEBM" : "EXPORT WEBM", left + 16, top + 142);
    ctx.fillStyle = "#83889b";
    ctx.font = "14px Arial, sans-serif";
    ctx.fillText(language === "ru" ? "Локальная обработка в браузере" : "Local processing in your browser", left, top + 204);
  }

  ctx.fillStyle = "#747a8f";
  ctx.font = "12px Arial, sans-serif";
  ctx.fillText(`${String(index + 1).padStart(2, "0")} / 06`, 42, h - 35);
  ctx.fillStyle = "#292d3a";
  roundedRect(ctx, 120, h - 43, 555, 6, 3);
  ctx.fill();
  ctx.fillStyle = "#b5f36d";
  roundedRect(ctx, 120, h - 43, 555 * ((index + phase) / 6), 6, 3);
  ctx.fill();
  ctx.restore();
}

export default function SelfIntroVideo({ language }: { language: Language }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [kind, setKind] = useState<VideoKind>("guide");
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  const createVideo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
      setError(language === "ru" ? "Этот браузер не поддерживает запись видео с холста. Попробуй обновить Chrome." : "Canvas video recording is not supported in this browser. Try updating Chrome.");
      return;
    }
    setError("");
    setVideoUrl("");
    setProgress(0);
    setIsRendering(true);
    const width = 720;
    const height = 1280;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsRendering(false);
      setError(language === "ru" ? "Не удалось подготовить холст." : "Could not prepare the video canvas.");
      return;
    }
    const scenes = copy[language][kind];
    const sceneDuration = 3.5;
    const totalDuration = sceneDuration * scenes.length;
    const stream = canvas.captureStream(30);
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setIsRendering(false);
      setError(language === "ru" ? "Не удалось запустить запись в этом браузере." : "Could not start recording in this browser.");
      return;
    }
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => {
      stream.getTracks().forEach((track) => track.stop());
      setIsRendering(false);
      setError(language === "ru" ? "Ошибка записи видео. Попробуй ещё раз." : "Video recording failed. Please try again.");
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        setProgress(100);
      } else {
        setError(language === "ru" ? "Видео получилось пустым. Попробуй ещё раз." : "The video was empty. Please try again.");
      }
      setIsRendering(false);
    };
    const startedAt = performance.now();
    const draw = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const sceneIndex = Math.min(scenes.length - 1, Math.floor(elapsed / sceneDuration));
      const phase = (elapsed % sceneDuration) / sceneDuration;
      drawScene(ctx, width, height, scenes[sceneIndex], sceneIndex, phase, language);
      setProgress(Math.min(99, Math.round((elapsed / totalDuration) * 100)));
      if (elapsed >= totalDuration) {
        recorder.stop();
        return;
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    recorder.start(250);
    rafRef.current = requestAnimationFrame(draw);
  };

  return (
    <section className="self-video panel">
      <div className="self-video-heading">
        <div>
          <span className="section-kicker">DRAVEX · SELF INTRO STUDIO</span>
          <h2>{language === "ru" ? "Видео о самом DRAVEX" : "Make a video about DRAVEX"}</h2>
          <p>{language === "ru" ? "Собери короткий обзор проекта или инструкцию — прямо в браузере, без платного API." : "Create a short project overview or how-to guide in your browser, without a paid API."}</p>
        </div>
        <span className="self-video-icon"><Video size={22} /></span>
      </div>
      <div className="self-video-controls">
        <label className="setting-field"><span>{language === "ru" ? "Тип ролика" : "Video type"}</span><select value={kind} onChange={(event) => setKind(event.target.value as VideoKind)} disabled={isRendering}>
          <option value="guide">{language === "ru" ? "Инструкция по использованию" : "How-to tutorial"}</option>
          <option value="overview">{language === "ru" ? "Обзор проекта" : "Project overview"}</option>
        </select></label>

      </div>
      <canvas ref={canvasRef} className="self-video-canvas" aria-label={language === "ru" ? "Предпросмотр кадра будущего видео" : "Preview frame of the generated video"} />
      <div className="self-video-actions">
        <button className="button button-primary" onClick={createVideo} disabled={isRendering}><Film size={16} /> {isRendering ? (language === "ru" ? `Создаём видео… ${progress}%` : `Rendering video… ${progress}%`) : (language === "ru" ? "Создать видео" : "Create video")} <Play size={15} /></button>
        {videoUrl && <a className="button button-quiet" href={videoUrl} download={kind === "guide" ? "dravex-how-to.webm" : "dravex-overview.webm"}><Download size={16} /> {language === "ru" ? "Скачать WebM" : "Download WebM"}</a>}
      </div>
      {isRendering && <div className="self-video-progress" role="status" aria-live="polite"><span style={{ width: `${progress}%` }} /></div>}
      {videoUrl && <video className="self-video-result" src={videoUrl} controls playsInline preload="metadata" />}
      {error && <p className="self-video-error" role="alert">{error}</p>}
      <p className="prototype-note"><Sparkles size={14} /> {language === "ru" ? "Первая версия автоматически собирает анимированную презентацию с титрами. Это не запись реальных нажатий и пока без озвучки; экспорт — WebM." : "This first version creates an animated, captioned presentation. It does not record real clicks and has no voiceover yet; export is WebM."}</p>
    </section>
  );
}
