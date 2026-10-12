/**
 * Browser wiring for the Control runtime: one owner via Web Locks, a dedicated
 * BroadcastChannel, a requestAnimationFrame loop, keyboard and visibility handling.
 * Experimental: used only by the Runner Quest 3D routes.
 */
import { PhysicalRole } from "@/lib/physicalInput/types";
import { ControlRuntime, type ControlView } from "./controlRuntime";
import { DEFAULT_ROOM, openChannel } from "./protocol";
import type { TherapistSettings } from "./types";

export const CHECKPOINT_KEY = "shumos.experimental.runner-quest-3d.checkpoint.v1";

export interface Checkpoint { sessionId: string; stageIndex: number; lifecycle: string; completed: number; at: number }
export function readCheckpoint(storage: Pick<Storage, "getItem">): Checkpoint | null {
  try {
    const raw = storage.getItem(CHECKPOINT_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return null;
    const c = v as Checkpoint;
    return typeof c.sessionId === "string" && Number.isSafeInteger(c.stageIndex) && typeof c.lifecycle === "string" && Number.isSafeInteger(c.completed) && typeof c.at === "number" ? c : null;
  } catch { return null; }
}
function saveCheckpoint(storage: Pick<Storage, "setItem">, view: ControlView): void {
  const s = view.session;
  try { storage.setItem(CHECKPOINT_KEY, JSON.stringify({ sessionId: s.sessionId, stageIndex: s.stageIndex, lifecycle: s.lifecycle, completed: s.results.length, at: Date.now() } satisfies Checkpoint)); } catch { /* best effort */ }
}

export interface ControlHandle { runtime: ControlRuntime; dispose(): void }

const isFormTarget = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input,select,textarea,button,a,[contenteditable=true]");

/** In SIMULATED foot modes the keyboard drives the simulated sensors (never the game directly). */
function simKey(rt: ControlRuntime, key: string): boolean {
  const src = rt.session.settings.inputSource;
  if (src === "KEYBOARD" || src === "MANUAL") return false;
  const right = PhysicalRole.RIGHT_FOOT as PhysicalRole.RIGHT_FOOT, left = PhysicalRole.LEFT_FOOT as PhysicalRole.LEFT_FOOT;
  const feet: Array<PhysicalRole.RIGHT_FOOT | PhysicalRole.LEFT_FOOT> = src === "RIGHT_FOOT" ? [right] : src === "LEFT_FOOT" ? [left] : [left, right];
  const primary = feet[0];
  switch (key) {
    case "ArrowLeft": rt.simulateGesture(src === "DUAL_FOOT" ? left : primary, "TILT_LEFT"); return true;
    case "ArrowRight": rt.simulateGesture(src === "DUAL_FOOT" ? right : primary, "TILT_RIGHT"); return true;
    case " ": case "ArrowUp": rt.simulateGesture(feet[feet.length - 1], "LIFT"); return true;
    default: return false;
  }
}

export function attachBrowserLoop(rt: ControlRuntime): () => void {
  let stopped = false, frame = 0;
  const loop = () => { if (stopped) return; rt.tick(); frame = requestAnimationFrame(loop); };
  const onVisibility = () => { if (document.hidden) rt.suspend("control-hidden"); };
  const onKeyDown = (e: KeyboardEvent) => {
    if (isFormTarget(e.target) && (e.key === " " || e.key === "Enter")) return;
    const handled = rt.session.settings.inputSource === "KEYBOARD" || rt.session.settings.inputSource === "MANUAL" ? rt.key(e.key, e.repeat).reason !== "no-gesture" : !e.repeat && simKey(rt, e.key);
    if (handled && ["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(e.key)) e.preventDefault();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("keydown", onKeyDown);
  frame = requestAnimationFrame(loop);
  return () => { stopped = true; cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("keydown", onKeyDown); };
}

export function mountControl(opts: {
  settings?: Partial<TherapistSettings>;
  onView(v: ControlView): void;
  onReady(h: ControlHandle): void;
  onWaiting(waiting: boolean): void;
  onError(message: string): void;
}): () => void {
  let disposed = false;
  let release: (() => void) | undefined;
  let runtime: ControlRuntime | undefined;
  const abort = new AbortController();
  if (!navigator.locks) {
    queueMicrotask(() => !disposed && opts.onError("استخدم متصفحًا يدعم Web Locks لضمان وجود نافذة تحكم واحدة."));
    return () => { disposed = true; };
  }
  opts.onWaiting(true);
  void navigator.locks.request(`shumos-runner-quest-3d-owner:${DEFAULT_ROOM}`, { signal: abort.signal }, async () => {
    if (disposed) return;
    opts.onWaiting(false);
    await new Promise<void>((resolve) => {
      release = resolve;
      try {
        const channel = openChannel(DEFAULT_ROOM, (raw) => runtime?.receive(raw));
        const rt = new ControlRuntime({
          now: () => performance.now(), wall: () => Date.now(), send: (m) => channel.send(m), ownerId: crypto.randomUUID(), newId: () => crypto.randomUUID(), settings: opts.settings,
          onView: (v) => { opts.onView(v); if (v.session.lifecycle !== "ready") saveCheckpoint(sessionStorage, v); },
        });
        runtime = rt;
        const stopLoop = attachBrowserLoop(rt);
        const close = () => {
          if (disposed) return;
          disposed = true;
          stopLoop();
          window.removeEventListener("pagehide", close);
          rt.dispose();
          channel.close();
          resolve();
        };
        window.addEventListener("pagehide", close);
        opts.onReady({ runtime: rt, dispose: close });
        release = close;
      } catch (e) {
        opts.onError(e instanceof Error ? e.message : "تعذّر تشغيل جلسة التحكم.");
        resolve();
      }
    });
  }).catch((e: unknown) => {
    if (!disposed && !(e instanceof DOMException && e.name === "AbortError")) opts.onError(e instanceof Error ? e.message : "تعذّر الحصول على قفل الجلسة.");
  });
  return () => { disposed = true; abort.abort(); release?.(); };
}
