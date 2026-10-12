import {NINE_STAGE_CURRICULUM} from './curriculum';
import { SessionAuthority } from "./sessionAuthority";
import { openExperimentalChannel } from "./sessionChannel";
import { FRAME_INTERVAL_MS, isId, isRecord, type ExperimentalSessionState, type SessionAction, type SessionSummary } from "./sessionContract";
import { EXPERIMENTAL_CHECKPOINT_KEY, EXPERIMENTAL_ROOM_KEY, recoveredSummary, saveCheckpoint } from "./sessionStorage";
import { RightHandFlightInput, SENSOR_PICKUP_RADIUS, subscribeToRightHandFlightInput } from "./sensorInput";

export interface ControlSessionView { state: ExperimentalSessionState; ready: boolean; previousSummary: SessionSummary | null; checkpointAvailable: boolean; cloud?: boolean; connected?: boolean; historyStatus?: string }
export interface ControlSessionHandle { action(action: SessionAction, revision: number, runId: number): boolean; manual?(x: number, y: number, override: boolean): void; dispose(): void }

/** Mounted behind the existing staff gate. One lock, one authority, one RAF scheduler. */
export function mountControlSession(onView: (view: ControlSessionView) => void, onReady: (handle: ControlSessionHandle) => void, onError: (message: string) => void, therapistManual = false): () => void {
  let disposed = false;
  const lockRequest = new AbortController();
  let runtime: ControlSessionHandle | undefined;
  let release: (() => void) | undefined;
  let roomId: string = crypto.randomUUID();
  let previousSummary: SessionSummary | null = null;
  let storageAvailable = true;
  try {
    const storedRoom = sessionStorage.getItem(EXPERIMENTAL_ROOM_KEY);
    if (storedRoom && /^[a-f0-9-]{36}$/.test(storedRoom)) roomId = storedRoom;
    sessionStorage.setItem(EXPERIMENTAL_ROOM_KEY, roomId);
    previousSummary = recoveredSummary(sessionStorage.getItem(EXPERIMENTAL_CHECKPOINT_KEY));
  } catch { storageAvailable = false; }
  if (!navigator.locks) {
    queueMicrotask(() => { if (!disposed) onError("Use a browser with Web Locks support to keep one therapist in charge of this local session."); });
    return () => { disposed = true; };
  }
  // Queue rather than racing ifAvailable: React development remounts must let
  // the previous owner release its lock before creating the replacement.
  void navigator.locks.request(`shumos-space-pilot-3d-owner:${roomId}`, { signal: lockRequest.signal }, async () => {
    if (disposed) return;
    await new Promise<void>((resolve) => {
      release = resolve;
      try {
        runtime = createRuntime(roomId, previousSummary, storageAvailable, onView, therapistManual);
        onReady(runtime);
      } catch (error) { onError(error instanceof Error ? error.message : "Could not start the local session."); resolve(); }
    });
  }).catch((error: unknown) => { if (!disposed) onError(error instanceof Error ? error.message : "Could not acquire the session lock."); });
  return () => { disposed = true; lockRequest.abort(); runtime?.dispose(); release?.(); };
}

function createRuntime(roomId: string, previousSummary: SessionSummary | null, checkpointAvailable: boolean, onView: (view: ControlSessionView) => void, therapistManual: boolean): ControlSessionHandle {
  const authority = new SessionAuthority(roomId, crypto.randomUUID(), crypto.randomUUID(),'LOW',undefined,therapistManual?NINE_STAGE_CURRICULUM:undefined);
  const sensor = new RightHandFlightInput();
  sensor.activate({ x: 0.5, y: 0.5 }); // Availability remains observable in keyboard mode.
  let unsubscribe: (() => void) | undefined;
  let disposed = false, frameId = 0, lastPublishedRevision = -1, lastFrameAt = -Infinity, lastEpoch = -1;
  let lastMode = authority.inputMode;
  let manualPointer = { x: .5, y: .5 };
  const releaseManual = () => { manualPointer = { x: .5, y: .5 }; authority.manual(therapistManual && authority.inputMode === "keyboard" ? manualPointer : null, false); sensor.rearm(held); };
  let cachedFrame = authority.frame(performance.now());
  let lastReady = false;
  const probes = new Map<string, number>();
  const held = { x: 0.5, y: 0.5 };
  const syncInput = () => {
    held.x = authority.simulation.ship.controlX; held.y = authority.simulation.ship.controlY;
    sensor.notePosition(held);
    if (authority.inputMode !== lastMode) {
      lastMode = authority.inputMode;
      sensor.activate(held);
    }
    if (lastEpoch !== authority.inputEpoch) {
      lastEpoch = authority.inputEpoch;
      if (lastMode === "sensor" && authority.lifecycle !== "running") sensor.rearm(held);
    }
  };
  const publish = (now: number) => {
    syncInput();
    const changed = authority.revision !== lastPublishedRevision;
    if (changed) {
      lastPublishedRevision = authority.revision;
      const state = authority.snapshot();
      if (state.lifecycle !== "ready") {
        try { checkpointAvailable = saveCheckpoint(sessionStorage, state); } catch { checkpointAvailable = false; }
      }
      channel.send({ version: 4, type: "state", state });
    }
    const ready = authority.canPlay(now);
    if (changed || ready !== lastReady) { lastReady = ready; onView({ state: authority.snapshot(), ready, previousSummary, checkpointAvailable }); }
    if (changed || now - lastFrameAt >= FRAME_INTERVAL_MS) {
      lastFrameAt = now; cachedFrame = authority.frame(now);
      channel.send({ version: 4, type: "frame", frame: cachedFrame });
    }
  };
  const channel = openExperimentalChannel(roomId, (raw) => {
    if (disposed) return;
    const now = performance.now();
    if (isRecord(raw) && raw.version === 4 && raw.type === "probe" && isId(raw.displayId) && isId(raw.nonce)) {
      // Bound discovery traffic and storage even before a Display is accepted.
      for (const [id, at] of probes) if (now - at > 1000) probes.delete(id);
      if ((!probes.has(raw.displayId) && probes.size >= 8) || now - (probes.get(raw.displayId) ?? -Infinity) < 75) return;
      probes.set(raw.displayId, now);
      publish(now);
      channel.send({ version: 4, type: "sync", displayId: raw.displayId, nonce: raw.nonce, state: authority.snapshot(), frame: cachedFrame });
    } else if (authority.receive(raw, now)) publish(now);
  });
  try { unsubscribe = subscribeToRightHandFlightInput(sensor); }
  catch (error) { channel.close(); sensor.dispose(); throw error; }
  const visibility = () => { if (document.hidden) { releaseManual(); authority.suspend("control-hidden"); publish(performance.now()); } };
  const close = () => {
    if (disposed) return;
    authority.suspend("control-closed"); publish(performance.now());
    channel.send({ version: 4, type: "closed", ownerId: authority.ownerId });
    disposed = true; cancelAnimationFrame(frameId); unsubscribe?.(); sensor.dispose(); channel.close();
    document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", close); window.removeEventListener("blur", releaseManual);
  };
  const loop = () => {
    if (disposed) return;
    // RAF's timestamp describes the frame start, which can precede an ACK
    // already delivered in this task. Lease checks use callback-entry time.
    const now = performance.now();
    visibility();
    let pointer = sensor.sample();
    if (authority.lifecycle !== "running" && pointer && Math.hypot(pointer.x - held.x, pointer.y - held.y) > SENSOR_PICKUP_RADIUS) {
      sensor.rearm(held); pointer = null;
    }
    if (therapistManual) authority.manual(authority.inputMode === "keyboard" || authority.manualOverride ? manualPointer : null, authority.manualOverride);
    authority.tick(now, pointer, sensor.status, sensor.latestPointer);
    publish(now);
    frameId = requestAnimationFrame(loop);
  };
  document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", close); window.addEventListener("blur", releaseManual);
  publish(performance.now()); frameId = requestAnimationFrame(loop);
  return {
    action(action, revision, runId) {
      if (disposed) return false;
      if (authority.inputMode === "sensor" && !authority.manualOverride && ["start", "resume", "next-mission"].includes(action.type)) {
        const pointer = sensor.sample();
        if (!pointer || Math.hypot(pointer.x - held.x, pointer.y - held.y) > SENSOR_PICKUP_RADIUS) return false;
      }
      const accepted = authority.command(action, revision, runId, performance.now());
      if (accepted) publish(performance.now());
      return accepted;
    },
    manual(x, y, override) {
      manualPointer = { x: .5 + Math.max(-1, Math.min(1, x)) * .5, y: .5 - Math.max(-1, Math.min(1, y)) * .5 };
      if (override !== authority.manualOverride) sensor.rearm(held);
      authority.manual(authority.inputMode === "keyboard" || override ? manualPointer : null, override);
      publish(performance.now());
    },
    dispose: close,
  };
}
