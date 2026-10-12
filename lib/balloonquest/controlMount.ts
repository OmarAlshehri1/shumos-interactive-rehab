/**
 * Browser wiring for the Control runtime: one owner via Web Locks, a dedicated
 * BroadcastChannel, a requestAnimationFrame loop, keyboard and visibility
 * handling. Experimental: used only by the dev-only prototype routes.
 */
import { ControlRuntime, type ControlView } from "./controlRuntime";
import { DEFAULT_ROOM, openChannel } from "./protocol";
import { KeyboardCursor } from "./input/keyboard";
import type { TherapistSettings } from "./types";

export const CHECKPOINT_KEY = "shumos.experimental.balloon-quest-3d.checkpoint.v1";

export interface Checkpoint {
  sessionId: string;
  stageIndex: number;
  lifecycle: string;
  completed: number;
  at: number;
}
export function readCheckpoint(storage: Pick<Storage, "getItem">): Checkpoint | null {
  try {
    const raw = storage.getItem(CHECKPOINT_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return null;
    const c = v as Checkpoint;
    return typeof c.sessionId === "string" && Number.isSafeInteger(c.stageIndex) && typeof c.lifecycle === "string" && Number.isSafeInteger(c.completed) && typeof c.at === "number" ? c : null;
  } catch {
    return null;
  }
}
function saveCheckpoint(storage: Pick<Storage, "setItem">, view: ControlView): void {
  const s = view.session;
  try {
    storage.setItem(CHECKPOINT_KEY, JSON.stringify({ sessionId: s.sessionId, stageIndex: s.stageIndex, lifecycle: s.lifecycle, completed: s.results.length, at: Date.now() } satisfies Checkpoint));
  } catch {
    /* storage unavailable: recovery hint is best-effort only */
  }
}

export interface ControlHandle {
  runtime: ControlRuntime;
  dispose(): void;
}

const isFormTarget = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input,select,textarea,button,a,[contenteditable=true]");

/**
 * Drives a ControlRuntime from the browser: one requestAnimationFrame loop, keyboard
 * cursor input, and a hold when the tab is hidden. Transport-agnostic (the local
 * channel and the production Firebase driver both use it). Returns a stop function.
 */
export function attachBrowserLoop(rt: ControlRuntime): () => void {
  let stopped = false;
  let frame = 0;
  const loop = () => {
    if (stopped) return;
    rt.tick();
    frame = requestAnimationFrame(loop);
  };
  const onVisibility = () => document.hidden && rt.suspend("control-hidden");
  const onKeyDown = (e: KeyboardEvent) => {
    if (rt.session.settings.inputMode !== "keyboard" || (e.repeat && (e.key === " " || e.key === "Enter"))) return;
    const isPress = e.key === " " || e.key === "Enter";
    if (isPress && isFormTarget(e.target)) return; // never steal Space/Enter from a focused control
    const action = rt.keyboard.keyDown(e.key);
    if (action) {
      if (action.kind === "press") rt.press("KEYBOARD");
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => rt.keyboard.keyUp(e.key);
  const onBlur = () => rt.keyboard.releaseAll();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  frame = requestAnimationFrame(loop);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
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
    return () => {
      disposed = true;
    };
  }
  opts.onWaiting(true);
  void navigator.locks
    .request(`shumos-balloon-quest-3d-owner:${DEFAULT_ROOM}`, { signal: abort.signal }, async () => {
      if (disposed) return;
      opts.onWaiting(false);
      await new Promise<void>((resolve) => {
        release = resolve;
        try {
          const channel = openChannel(DEFAULT_ROOM, (raw) => runtime?.receive(raw));
          const rt = new ControlRuntime({
            now: () => performance.now(),
            wall: () => Date.now(),
            send: (m) => channel.send(m),
            ownerId: crypto.randomUUID(),
            newId: () => crypto.randomUUID(),
            settings: opts.settings,
            onView: (v) => {
              opts.onView(v);
              if (v.session.lifecycle !== "ready") saveCheckpoint(sessionStorage, v);
            },
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
          // Allow the outer dispose to end the loop too.
          release = close;
        } catch (e) {
          opts.onError(e instanceof Error ? e.message : "تعذّر تشغيل جلسة التحكم.");
          resolve();
        }
      });
    })
    .catch((e: unknown) => {
      if (!disposed && !(e instanceof DOMException && e.name === "AbortError")) opts.onError(e instanceof Error ? e.message : "تعذّر الحصول على قفل الجلسة.");
    });

  return () => {
    disposed = true;
    abort.abort();
    release?.();
  };
}

export { KeyboardCursor };
