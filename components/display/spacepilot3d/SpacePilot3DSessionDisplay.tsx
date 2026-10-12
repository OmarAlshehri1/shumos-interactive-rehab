"use client";

import {SPACE_STAGES} from '@/lib/spacepilot3d/curriculum';
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { createLiveDisplay } from "@/lib/spacepilot3d/firebaseDisplayRuntime";
import type { SpacePilotLiveSession } from "@/lib/spacepilot3d/cloudState";
import { useCallback, useEffect, useRef, useState } from "react";
import { createDisplaySession, type DisplaySessionView } from "@/lib/spacepilot3d/displaySessionRuntime";
import { createPrototypeRenderer } from "@/lib/spacepilot3d/renderer";
import { lifecycleArabic, missionArabic, numberArabic } from "@/lib/spacepilot3d/arabic";
import styles from "./prototype.module.css";

const noop = () => {};

/**
 * Child-facing Space Pilot 3D scene. With Firebase it is fed the shared live session (`live`) by the standard Display;
 * without Firebase it follows the local Control window over a BroadcastChannel (`#room=`).
 */
export function SpacePilot3DSessionDisplay({ integrated = false, live = null }: { integrated?: boolean; live?: SpacePilotLiveSession | null } = {}) {
  const liveDisplay = useRef<ReturnType<typeof createLiveDisplay> | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), guide = useRef<HTMLDivElement>(null), objective = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<DisplaySessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [reducedCamera, setReducedCamera] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; key: string } | null>(null);
  const previous = useRef<DisplaySessionView | null>(null);
  const rendererRef = useRef<ReturnType<typeof createPrototypeRenderer> | null>(null);
  const receive = useCallback((next: DisplaySessionView) => {
    const old = previous.current, state = next.state;
    // Announce newly accepted outcomes only, never historical results after reload/reconnect.
    if (next.connected && old?.connected && state && old.state?.sessionId === state.sessionId && old.state.runId === state.runId && state.lifecycle === "running") {
      const text = state.stats.asteroidsAvoided > old.state.stats.asteroidsAvoided ? "مرور جميل وآمن" : state.stats.upgradeTier > old.state.stats.upgradeTier ? `مركبتك تطوّرت! المستوى ${numberArabic(state.stats.upgradeTier)}` : state.stats.ringsCollected > old.state.stats.ringsCollected ? "أحسنت! حلقة مكتملة" : state.stats.asteroidCollisions > old.state.stats.asteroidCollisions ? "لا بأس، نكمل الرحلة" : null;
      if (text) setFeedback({ text, key: `${state.sessionId}/${state.runId}/${state.eventSequence}` });
    } else setFeedback(null);
    previous.current = next; setView(next);
  }, []);
  const reportError = useCallback((message: string) => setError(message), []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    const cloud = integrated && isRealtimeEnabled();
    const room = cloud ? null : new URLSearchParams(window.location.hash.slice(1)).get("room");
    queueMicrotask(() => setSettings(new URLSearchParams(window.location.search).get("settings") === "1"));
    if (!cloud && (!room || !/^[a-f0-9-]{36}$/.test(room))) {
      queueMicrotask(() => reportError("افتح شاشة الطفل من صفحة قائد الفضاء في تحكم المعالج."));
      return;
    }
    if (!canvas.current || !guide.current) return;
    let session: { driver: ReturnType<typeof createLiveDisplay>["driver"]; dispose: () => void } | undefined;
    let renderer: ReturnType<typeof createPrototypeRenderer> | undefined;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => { renderer?.setReducedEffects(preference.matches); renderer?.setReducedCameraMotion(preference.matches); setReduced(preference.matches); setReducedCamera(preference.matches); };
    try {
      if (cloud) { liveDisplay.current = createLiveDisplay(receive, reportError); session = liveDisplay.current; }
      else session = createDisplaySession(canvas.current, room!, receive);
      renderer = createPrototypeRenderer(canvas.current, (status, message) => { if (status === "error") reportError(message ?? "Graphics unavailable."); }, noop, guide.current, noop, session.driver, objective.current ?? undefined);
      rendererRef.current = renderer;
      renderer.setReducedEffects(preference.matches); renderer.setReducedCameraMotion(preference.matches);
      queueMicrotask(() => { setReduced(preference.matches); setReducedCamera(preference.matches); });
      preference.addEventListener("change", applyPreference);
    } catch (reason) { session?.dispose(); queueMicrotask(() => reportError(reason instanceof Error ? reason.message : "Could not open the 3D scene.")); }
    return () => { preference.removeEventListener("change", applyPreference); previous.current = null; rendererRef.current = null; liveDisplay.current = null; renderer?.dispose(); session?.dispose(); };
  }, [receive, reportError, integrated]);
  // Feed each live record from the standard Display into the scene runtime (declared after the creating effect, so it runs second on mount).
  useEffect(() => { if (live) liveDisplay.current?.accept(live); }, [live]);
  const state = view?.state;
  const connected = !!view?.connected;
  const lifecycle = connected && state ? state.lifecycle : "disconnected";
  const complete = lifecycle === "completed" || lifecycle === "ended";
  const resting = lifecycle !== "running";
  const message = lifecycle === "mission-complete" ? "أحسنت! اكتملت المهمة" : complete ? "أحسنت يا قائد الفضاء!" : lifecycleArabic[lifecycle];
  const alignment = state?.inputMode === "sensor" && !complete && (state.sensorStatus !== "tracking" || resting);
  return <main className={`${styles.preview} ${styles.childDisplay}`} lang="ar" dir="rtl" data-reduced-effects={reduced}>
    <canvas ref={canvas} className={styles.canvas} tabIndex={0} aria-label="قائد الفضاء · توجيه المعالج أو اليد اليمنى" />
    <div ref={objective} className={styles.objective} hidden data-testid="objective-guidance" aria-hidden="true"><span className={styles.objectiveSymbol}>✧</span><span className={styles.objectiveArrow}>›</span><small data-objective-label /></div>
    <header className={styles.header}><span className={styles.badge}>شموس · قائد الفضاء</span><h1>{state ? state.curriculumId?SPACE_STAGES[state.mission-1].nameAr:missionArabic[state.mission - 1] : "الحلقات الذهبية"}</h1><p>{state ? state.curriculumId?`المستوى ${numberArabic(SPACE_STAGES[state.mission-1].level)} · المرحلة ${numberArabic(SPACE_STAGES[state.mission-1].stage)} — ${numberArabic(state.mission)} / ٩`:`المهمة ${numberArabic(state.mission)} من ٣` : "رحلتك تبدأ قريبًا"}</p></header>
    {state && <aside className={styles.sessionHud} aria-label="تقدم الرحلة" data-testid="session-stats" data-session={state.sessionId} data-run={state.runId} data-revision={state.revision} data-stage-index={state.mission-1} data-completed={state.stats.completedMissions} data-skipped={state.stageResults?.filter(r=>r.status==='skipped').length??0} data-events={state.eventSequence} data-collected={state.stats.ringsCollected} data-collisions={state.stats.asteroidCollisions} data-resolved={state.stats.resolved}>
      <strong><span aria-hidden="true">◎</span> {numberArabic(state.stats.ringsCollected)} <small>الحلقات المكتملة</small></strong><span>{numberArabic(state.stats.score)} نقطة <i>·</i> المستوى {numberArabic(state.stats.upgradeTier)}</span><progress aria-label="تقدم الرحلة" value={state.stats.resolved} max={state.stats.totalEncounters} />
    </aside>}
    <span className={styles.srOnly} data-testid="session-lifecycle" data-lifecycle={lifecycle}>{lifecycleArabic[lifecycle]}</span>
    {resting && !(lifecycle==='ready'&&state?.instructionsVisible) && <div className={styles.flightMessage} data-testid="flight-message" role="status"><span className={styles.messageIcon} aria-hidden="true">{complete || lifecycle === "mission-complete" ? "✦" : "· · ·"}</span><h2>{message}</h2><p>{lifecycle === "mission-complete" ? "استراحة قصيرة… ثم مغامرة جديدة" : complete ? `جمعت ${numberArabic(state?.stats.ringsCollected ?? 0)} حلقة · شكرًا لمشاركتك` : lifecycle === "ready" ? "مرّ عبر الحلقات الذهبية لتطوير مركبتك!" : "خذ وقتك، المعالج معك"}</p></div>}
    {lifecycle==='ready'&&state?.instructionsVisible&&<section className={styles.instructions} data-testid="flight-instructions" aria-label="تعليمات الرحلة"><article><span className={styles.instructionRing} aria-hidden="true"/><h2>مرّ عبر الحلقات الذهبية لتطوير مركبتك!</h2></article><article><span className={styles.instructionRock} aria-hidden="true"/><h2>ابتعد عن النيازك وأكمل رحلتك!</h2></article><p>المعالج يبدأ الرحلة عندما تكون جاهزًا</p></section>}
    {!resting && state?.accessibility.mode==='MEDIUM'&&<small className={styles.assistBadge}>مساعدة الارتفاع مفعّلة</small>}
    {!resting && feedback && <div key={feedback.key} className={styles.reward} role="status" data-testid="flight-feedback">{feedback.text}</div>}
    <div className={styles.guide} style={{ visibility: alignment ? "visible" : "hidden" }} aria-label="مطابقة موضع اليد">
      <div className={styles.inputMap} ref={guide} data-testid="flight-input-guide"><span className={styles.shipDot} /><span className={styles.pointerDot} /></div><small>طابق النقطة الذهبية مع الزرقاء</small>
    </div>
    {settings && <details className={styles.displaySettings}><summary>إعدادات المعالج</summary><label>جودة الرسوم <select aria-label="جودة الرسوم" defaultValue="medium" onChange={event => rendererRef.current?.setQuality(event.target.value as "low" | "medium" | "high")}><option value="low">اقتصادية</option><option value="medium">متوازنة</option><option value="high">عالية</option></select></label><label><input type="checkbox" checked={reduced} onChange={event => { setReduced(event.target.checked); rendererRef.current?.setReducedEffects(event.target.checked); }} /> تقليل المؤثرات والحركة</label><label><input type="checkbox" checked={reducedCamera || !!state?.flightSettings.reducedCamera} disabled={!!state?.flightSettings.reducedCamera} onChange={event => { setReducedCamera(event.target.checked); rendererRef.current?.setReducedCameraMotion(event.target.checked); }} /> تقليل حركة الكاميرا</label><button onClick={() => setSettings(false)}>إخفاء الإعدادات</button></details>}
    {error && <div role="alert" className={styles.failure}><h2>نحتاج إلى إعادة فتح العرض</h2><p>الرحلة متوقفة بأمان. اطلب مساعدة المعالج.</p>{settings && <p dir="auto">{error}</p>}<button onClick={() => window.location.reload()}>إعادة تحميل العرض</button></div>}
    <footer className={styles.childFooter}>شموس <span>كل حلقة خطوة جميلة</span></footer>
  </main>;
}
