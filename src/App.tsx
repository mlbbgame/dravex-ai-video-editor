import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Film, Upload, WandSparkles, Download, Music2, CheckCircle2, LoaderCircle, RefreshCw, Play, Sparkles } from "lucide-react";
import { analyzeVideoForHighlights, type HighlightMoment, type HighlightProgress } from "./video/highlight-finder";
import { renderVideoSequence, type SequenceRenderStyle, type VideoSegment, type ImageSegment, type AudioSegment } from "./video/video-sequence-render";

type EditStyle = "velocity" | "cinematic" | "anime";
type Stage = "empty" | "ready" | "analyzing" | "rendering" | "done" | "error";

const styleOptions: Array<{ id: EditStyle; title: string; note: string }> = [
  { id: "velocity", title: "Динамичный", note: "Быстрые кадры и энергичная подача" },
  { id: "cinematic", title: "Кинематографичный", note: "Более плавный ритм и выразительные планы" },
  { id: "anime", title: "AMV / Anime", note: "Контраст, насыщенность и быстрый визуальный ритм" }
];

function makeSegments(candidates: HighlightMoment[], sourceDuration: number, targetDuration: number, style: EditStyle, file: File, url: string): VideoSegment[] {
  const shotLength = style === "velocity" ? 1.35 : style === "anime" ? 1.7 : 2.5;
  const usableDuration = Math.min(sourceDuration, targetDuration);
  const count = Math.max(1, Math.ceil(usableDuration / shotLength));
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const selected: HighlightMoment[] = [];
  for (let bucket = 0; bucket < count; bucket += 1) {
    const from = sourceDuration * bucket / count;
    const to = sourceDuration * (bucket + 1) / count;
    const best = ranked.find((moment) => moment.time >= from && moment.time < to && selected.every((item) => Math.abs(item.time - moment.time) > Math.max(1.5, shotLength * 0.8)));
    if (best) selected.push(best);
  }
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (selected.every((existing) => Math.abs(existing.time - item.time) > 0.8)) selected.push(item);
  }
  selected.sort((a, b) => a.time - b.time);
  if (!selected.length) {
    return [{ name: file.name, url, trimStart: 0, trimEnd: Math.min(usableDuration, sourceDuration) }];
  }
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
  const [stage, setStage] = useState<Stage>("empty");
  const [duration, setDuration] = useState(30);
  const [style, setStyle] = useState<EditStyle>("velocity");
  const [scan, setScan] = useState<HighlightProgress>({ current: 0, total: 0, time: 0 });
  const [renderProgress, setRenderProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const [outputName, setOutputName] = useState("");
  const [cutCount, setCutCount] = useState(0);
  const videoInput = useRef<HTMLInputElement>(null);
  const videoFile = mediaFiles[0] ?? null;
  const videoUrl = mediaUrls[0] ?? "";
  const isImageMode = mediaFiles.length > 0 && mediaFiles.every((file) => file.type.startsWith("image/"));
  const musicInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { mediaUrls.forEach((url) => URL.revokeObjectURL(url)); }, [mediaUrls]);
  useEffect(() => () => { if (musicUrl) URL.revokeObjectURL(musicUrl); }, [musicUrl]);
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl); }, [outputUrl]);

  const onVideoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const hasInvalid = files.some((file) => !file.type.startsWith("video/") && !file.type.startsWith("image/"));
    const videos = files.filter((file) => file.type.startsWith("video/"));
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (hasInvalid || (videos.length && (videos.length !== 1 || images.length))) {
      setError("Выбери одно видео или несколько изображений. Видео и изображения пока нужно монтировать отдельно.");
      event.target.value = "";
      return;
    }
    mediaUrls.forEach((url) => URL.revokeObjectURL(url));
    setMediaFiles(files);
    setMediaUrls(files.map((file) => URL.createObjectURL(file)));
    setOutputUrl("");
    setError("");
    setMessage(videos.length ? "Видео готово к автоматическому монтажу." : "Изображения готовы к автоматическому монтажу.");
    setStage("ready");
    setScan({ current: 0, total: 0, time: 0 });
    event.target.value = "";
  };

  const onMusicSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("Выбери аудиофайл MP3, WAV, M4A или другой поддерживаемый браузером формат.");
      return;
    }
    setMusicFile(file);
    setMusicUrl(URL.createObjectURL(file));
    setError("");
  };

  const createMontage = async () => {
    if (!mediaFiles.length || stage === "analyzing" || stage === "rendering") return;
    setError("");
    setOutputUrl("");
    setRenderProgress(0);
    setScan({ current: 0, total: 0, time: 0 });
    try {
      setStage("analyzing");
      setMessage("Анализируем визуальные изменения и выбираем моменты…");
      let segments: Array<VideoSegment | ImageSegment>;
      let renderDuration = duration;
      if (isImageMode) {
        segments = mediaFiles.map((file, index) => ({ kind: "image" as const, name: file.name, url: mediaUrls[index], duration: duration / mediaFiles.length }));
        setScan({ current: mediaFiles.length, total: mediaFiles.length, time: 0 });
      } else {
        const analysis = await analyzeVideoForHighlights(videoUrl, setScan);
        renderDuration = Math.min(duration, analysis.duration);
        segments = makeSegments(analysis.candidates, analysis.duration, renderDuration, style, videoFile!, videoUrl);
      }
      if (!segments.length) throw new Error("Не удалось собрать последовательность кадров. Попробуй другой исходник.");
      setCutCount(segments.length);
      setStage("rendering");
      setMessage("Собираем монтаж, применяем визуальный стиль и записываем видео…");
      const audioTracks: AudioSegment[] = musicUrl && musicFile ? [{ name: musicFile.name, url: musicUrl, volume: 0.72 }] : [];
      const blob = await renderVideoSequence({
        segments,
        audioTracks,
        title: "",
        aspectRatio: "9:16",
        quality: "720p",
        style: style as SequenceRenderStyle,
        targetDurationSeconds: renderDuration,
        onProgress: setRenderProgress
      });
      const nextUrl = URL.createObjectURL(blob);
      setOutputUrl(nextUrl);
      setOutputName(`dravex-auto-montage-${Date.now()}.webm`);
      setStage("done");
      setMessage("Готово! Проверь результат и сохрани видео.");
    } catch (caught) {
      setStage("error");
      setError(caught instanceof Error ? caught.message : "Не получилось создать монтаж. Попробуй другой файл или более короткий ролик.");
      setMessage("");
    }
  };

  const busy = stage === "analyzing" || stage === "rendering";
  const scanPercent = scan.total ? Math.round((scan.current / scan.total) * 100) : 0;

  return (
    <main className="auto-app">
      <header className="auto-header">
        <a className="auto-brand" href="#" aria-label="DRAVEX home"><span className="auto-brand-icon"><Film size={22} /></span><span>DRAVEX<small>AI AUTO MONTAGE</small></span></a>
        <div className="auto-header-status"><span className="auto-status-dot" /> Локальная обработка</div>
      </header>

      <section className="auto-hero">
        <div className="auto-eyebrow"><Sparkles size={14} /> АВТОМОНТАЖ НА ОДНОМ ЭКРАНЕ</div>
        <h1>Твоё видео.<br /><span>Готовый монтаж.</span></h1>
        <p>Загрузи исходник — DRAVEX найдёт выразительные моменты, соберёт динамичную последовательность и подготовит вертикальное видео.</p>
      </section>

      <section className="auto-workspace">
        <div className="auto-step-heading"><span>01</span><div><h2>Добавь исходное видео</h2><p>Видео или изображения автоматически собираются в ролик прямо в браузере.</p></div></div>
        <input ref={videoInput} className="auto-hidden-input" type="file" accept="video/*,image/*" multiple onChange={onVideoSelected} />
        {!mediaFiles.length ? (
          <button className="auto-upload-zone" onClick={() => videoInput.current?.click()} type="button">
            <span className="auto-upload-icon"><Upload size={25} /></span><strong>Выбрать видео</strong><span>Выбери видео или несколько изображений на телефоне</span><small>MP4 / WebM / JPG / PNG · изображения можно объединить в ролик</small>
          </button>
        ) : (
          <div className="auto-source-card">
            {isImageMode ? <div className="auto-image-grid">{mediaFiles.map((file, index) => <div className="auto-image-thumb" key={mediaUrls[index]}><img src={mediaUrls[index]} alt={file.name} /><span>{index + 1}. {file.name}</span></div>)}</div> : <video className="auto-source-preview" src={videoUrl} controls playsInline preload="metadata" />}
            <div className="auto-source-meta"><div><strong>{isImageMode ? `${mediaFiles.length} изображений выбрано` : videoFile?.name}</strong><span>{(mediaFiles.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)} МБ · исходник загружен</span></div><button className="auto-text-button" onClick={() => videoInput.current?.click()} type="button">Заменить</button></div>
          </div>
        )}

        <div className="auto-step-heading auto-step-two"><span>02</span><div><h2>Выбери характер монтажа</h2><p>Можно оставить динамичный вариант по умолчанию.</p></div></div>
        <div className="auto-style-grid">
          {styleOptions.map((option) => <button key={option.id} type="button" className={`auto-style-card ${style === option.id ? "selected" : ""}`} onClick={() => setStyle(option.id)}><span className="auto-style-check">{style === option.id ? <CheckCircle2 size={17} /> : <span />}</span><strong>{option.title}</strong><small>{option.note}</small></button>)}
        </div>

        <div className="auto-options-row">
          <label className="auto-option"><span>Длина ролика</span><select value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={15}>15 секунд</option><option value={30}>30 секунд</option><option value={60}>До 60 секунд</option></select></label>
          <div className="auto-option"><span>Музыка (необязательно)</span><input ref={musicInput} className="auto-hidden-input" type="file" accept="audio/*" onChange={onMusicSelected} /><button type="button" className="auto-music-button" onClick={() => musicInput.current?.click()}><Music2 size={16} />{musicFile ? musicFile.name : "Добавить свой трек"}</button></div>
        </div>

        <button className="auto-create-button" type="button" disabled={!mediaFiles.length || busy} onClick={createMontage}>{busy ? <LoaderCircle className="auto-spin" size={19} /> : <WandSparkles size={19} />}{stage === "rendering" ? "Создаём видео…" : stage === "analyzing" ? "Анализируем видео…" : "АВТОМОНТАЖ"}</button>

        {busy && <div className="auto-progress-panel"><div className="auto-progress-top"><strong>{stage === "analyzing" ? "Шаг 1 из 2 · Поиск моментов" : "Шаг 2 из 2 · Сборка ролика"}</strong><span>{stage === "analyzing" ? `${scanPercent}%` : `${renderProgress}%`}</span></div><div className="auto-progress-track"><div style={{ width: `${stage === "analyzing" ? scanPercent : renderProgress}%` }} /></div><p>{message}</p><small>Не закрывай вкладку и не блокируй телефон во время экспорта.</small></div>}

        {error && <div className="auto-error" role="alert">{error}</div>}
        {stage === "done" && outputUrl && <div className="auto-result"><div className="auto-result-heading"><CheckCircle2 size={20} /><div><strong>Монтаж готов</strong><span>{cutCount} фрагментов · вертикальный формат 9:16 · WebM</span></div></div><video className="auto-output-preview" src={outputUrl} controls playsInline /><div className="auto-result-actions"><a className="auto-download-button" href={outputUrl} download={outputName}><Download size={17} />Сохранить видео</a><button className="auto-again-button" type="button" onClick={createMontage}><RefreshCw size={16} />Создать заново</button></div></div>}
      </section>

      <section className="auto-truth-note"><span><Play size={15} /></span><p><strong>Честно о текущей версии.</strong> Это первая версия: для видео браузер оценивает визуальные изменения, контраст и насыщенность; изображения собираются в последовательность с лёгким движением. Экспорт доступен в WebM; автоматический поиск трендовых примеров, интеллектуальное понимание сцен, точная синхронизация с битом, расширенные переходы и MP4-экспорт ещё предстоит разработать.</p></section>
      <footer className="auto-footer">DRAVEX <span>·</span> Сделано для быстрого монтажа</footer>
    </main>
  );
}
