import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Cpu, Database, FlaskConical, Gauge, Heart, ShieldCheck, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";

type EvolutionEvent = "media_imported" | "plan_created" | "reference_analyzed" | "render_success" | "render_failure" | "clip_changed";
type Metrics = Record<EvolutionEvent, number>;
type Feedback = { score: number; note: string; createdAt: string };
const STORAGE_KEY = "dravex.evolution.v1";
const EVENTS: EvolutionEvent[] = ["media_imported", "plan_created", "reference_analyzed", "render_success", "render_failure", "clip_changed"];
const emptyMetrics = (): Metrics => ({ media_imported: 0, plan_created: 0, reference_analyzed: 0, render_success: 0, render_failure: 0, clip_changed: 0 });

type StoredState = { schemaVersion: 1; metrics: Metrics; feedback: Feedback[]; diagnostics: { checkedAt: string; results: Record<string, boolean> } | null };
const emptyState = (): StoredState => ({ schemaVersion: 1, metrics: emptyMetrics(), feedback: [], diagnostics: null });

function readState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return { ...emptyState(), ...parsed, metrics: { ...emptyMetrics(), ...(parsed.metrics ?? {}) }, feedback: Array.isArray(parsed.feedback) ? parsed.feedback.slice(-20) : [] };
  } catch {
    return emptyState();
  }
}
function writeState(state: StoredState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Private browsing or full storage: the app still works without persistence. */ }
}
export function trackEvolutionEvent(event: EvolutionEvent) {
  if (typeof window === "undefined") return;
  const state = readState();
  state.metrics[event] = (state.metrics[event] ?? 0) + 1;
  writeState(state);
  window.dispatchEvent(new CustomEvent("dravex:evolution-updated"));
}

export default function EvolutionEngine({ language = "en" }: { language?: "en" | "ru" }) {
  const ru = language === "ru";
  const [state, setState] = useState<StoredState>(() => typeof window === "undefined" ? emptyState() : readState());
  const [score, setScore] = useState(0);
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosticMessage, setDiagnosticMessage] = useState("");

  const refresh = () => setState(readState());
  useEffect(() => {
    window.addEventListener("dravex:evolution-updated", refresh);
    return () => window.removeEventListener("dravex:evolution-updated", refresh);
  }, []);

  const diagnostics = useMemo(() => state.diagnostics?.results ?? null, [state.diagnostics]);
  const successCount = state.metrics.render_success;
  const failureCount = state.metrics.render_failure;
  const renderAttempts = successCount + failureCount;
  const renderRate = renderAttempts ? Math.round((successCount / renderAttempts) * 100) : null;

  const runDiagnostics = async () => {
    setDiagnosing(true);
    setDiagnosticMessage("");
    const results: Record<string, boolean> = {};
    try {
      results["Local storage"] = (() => { try { const k = "dravex.check"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch { return false; } })();
      results["WebM recording"] = typeof MediaRecorder !== "undefined" && (typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported("video/webm"));
      results["Canvas capture"] = typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
      results["Audio engine"] = typeof AudioContext !== "undefined" || "webkitAudioContext" in window;
      results["Secure browser context"] = window.isSecureContext;
      results["Worker support"] = typeof Worker !== "undefined";
      const next = readState();
      next.diagnostics = { checkedAt: new Date().toISOString(), results };
      writeState(next);
      setState(next);
      setDiagnosticMessage(ru ? "Проверка завершена. Это диагностика браузера, а не тест качества готового видео." : "Check complete. This tests browser capabilities, not the visual quality of an exported video.");
    } finally { setDiagnosing(false); }
  };

  const saveFeedback = () => {
    if (!score) return;
    const next = readState();
    next.feedback.push({ score, note: note.trim().slice(0, 240), createdAt: new Date().toISOString() });
    next.feedback = next.feedback.slice(-20);
    writeState(next);
    setState(next);
    setScore(0);
    setNote("");
    setDiagnosticMessage(ru ? "Оценка сохранена только на этом устройстве." : "Feedback saved on this device only.");
  };

  const clearLocalData = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage can be unavailable. */ }
    const next = emptyState();
    setState(next);
    setDiagnosticMessage(ru ? "Локальная история DRAVEX очищена." : "Local DRAVEX history cleared.");
    window.dispatchEvent(new CustomEvent("dravex:evolution-updated"));
  };

  const labels: Record<string, string> = ru
    ? { media_imported: "Импорт медиа", plan_created: "Планы созданы", reference_analyzed: "Референсы изучены", render_success: "Экспорт успешен", render_failure: "Ошибки экспорта", clip_changed: "Правки клипов" }
    : { media_imported: "Media imports", plan_created: "Plans created", reference_analyzed: "References analyzed", render_success: "Successful exports", render_failure: "Export failures", clip_changed: "Clip edits" };

  return <section className="evolution-panel panel" aria-labelledby="evolution-title">
    <div className="evolution-heading">
      <span className="evolution-icon"><Activity size={21} /></span>
      <div className="evolution-heading-copy">
        <span className="section-kicker">DRAVEX EVOLUTION ENGINE · FOUNDATION</span>
        <h2 id="evolution-title">{ru ? "Система саморазвития" : "Self-improvement system"}</h2>
        <p>{ru ? "Измеряем работу, собираем добровольную обратную связь и проверяем возможности устройства. Данные остаются в браузере." : "Measure workflows, collect voluntary feedback, and check device capabilities. Data stays in this browser."}</p>
      </div>
      <span className="evolution-local-badge"><ShieldCheck size={13} /> {ru ? "Локально" : "Local only"}</span>
    </div>

    <div className="evolution-metrics">
      <div className="evolution-metric"><span>{ru ? "Успешность экспорта" : "Export success rate"}</span><strong>{renderRate === null ? "—" : `${renderRate}%`}</strong><small>{renderAttempts ? (ru ? `${renderAttempts} попыток` : `${renderAttempts} attempts`) : (ru ? "Пока нет измерений" : "No measurements yet")}</small></div>
      <div className="evolution-metric"><span>{ru ? "Создано планов" : "Plans created"}</span><strong>{state.metrics.plan_created}</strong><small>{ru ? "Локальная статистика" : "Local counter"}</small></div>
      <div className="evolution-metric"><span>{ru ? "Оценки пользователей" : "User ratings"}</span><strong>{state.feedback.length}</strong><small>{ru ? "Не отправляются" : "Never uploaded"}</small></div>
    </div>

    <div className="evolution-actions">
      <button className="button button-primary" onClick={runDiagnostics} disabled={diagnosing}><Gauge size={16} /> {diagnosing ? (ru ? "Проверяем…" : "Checking…") : (ru ? "Проверить возможности" : "Run device check")}</button>
      <button className="button button-quiet" onClick={() => setExpanded((value) => !value)}><FlaskConical size={16} /> {expanded ? (ru ? "Скрыть детали" : "Hide details") : (ru ? "История и метрики" : "Metrics & history")}</button>
    </div>

    {diagnosticMessage && <p className="evolution-message" role="status">{diagnosticMessage}</p>}
    {diagnostics && <div className="evolution-diagnostics">
      <div className="evolution-subheading"><Cpu size={15} /> {ru ? "Возможности браузера" : "Browser capabilities"} <span>{state.diagnostics?.checkedAt ? new Date(state.diagnostics.checkedAt).toLocaleString(ru ? "ru-RU" : "en-US") : ""}</span></div>
      {Object.entries(diagnostics).map(([name, passed]) => <div className="evolution-check" key={name}><span>{name}</span><strong className={passed ? "check-pass" : "check-warn"}>{passed ? (ru ? "Доступно" : "Available") : (ru ? "Недоступно" : "Unavailable")}</strong></div>)}
    </div>}

    {expanded && <div className="evolution-details">
      <div className="evolution-subheading"><Database size={15} /> {ru ? "Счётчики событий" : "Workflow counters"}</div>
      {EVENTS.map((event) => <div className="evolution-check" key={event}><span>{labels[event]}</span><strong>{state.metrics[event]}</strong></div>)}
      <div className="evolution-feedback">
        <div className="evolution-subheading"><Heart size={15} /> {ru ? "Оцени DRAVEX" : "Rate DRAVEX"}</div>
        <p>{ru ? "Оценка помогает отслеживать удовлетворённость. Она сохраняется только на этом устройстве." : "Your rating helps track satisfaction and is stored on this device only."}</p>
        <div className="evolution-rating" role="group" aria-label={ru ? "Оценка от 1 до 5" : "Rating from 1 to 5"}>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={score === value ? "rating-selected" : ""} onClick={() => setScore(value)} aria-pressed={score === value}>{value}</button>)}</div>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder={ru ? "Что улучшить? (необязательно)" : "What should improve? (optional)"} rows={2} />
        <button className="button button-primary" onClick={saveFeedback} disabled={!score}><CheckCircle2 size={15} /> {ru ? "Сохранить оценку" : "Save rating"}</button>
      </div>
      <div className="evolution-roadmap"><div className="evolution-subheading"><Wrench size={15} /> {ru ? "Правило безопасного улучшения" : "Safe improvement rule"}</div><p>{ru ? "Изменение должно пройти автоматические проверки и сравнение метрик на тестовых проектах. Пока этот модуль измеряет работу; он не меняет собственный код и не заявляет, что обучил модель." : "A change must pass automated checks and benchmark comparisons on test projects. This module measures workflows; it does not edit its own code or claim to have trained a model."}</p></div>
      <button className="evolution-clear" onClick={clearLocalData}><ThumbsDown size={14} /> {ru ? "Очистить локальную историю" : "Clear local history"}</button>
    </div>}
    <p className="evolution-footnote"><ShieldCheck size={13} /> {ru ? "Без загрузки медиа, имён файлов или личных данных. Автоматическое изменение кода пока отключено." : "No media, filenames, or personal data uploaded. Automatic code changes are not enabled."}</p>
  </section>;
}
