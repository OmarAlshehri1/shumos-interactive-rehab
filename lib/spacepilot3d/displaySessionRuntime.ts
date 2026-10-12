import { KeyboardFlightInput } from "./keyboardInput";
import { AcceptedScene, type RemoteSceneDriver } from "./presentation";
import { openExperimentalChannel } from "./sessionChannel";
import { FRAME_INTERVAL_MS, PROBE_INTERVAL_MS, type ExperimentalSessionState } from "./sessionContract";
import { SessionReplica } from "./sessionReplica";

export interface DisplaySessionView { state: ExperimentalSessionState | null; connected: boolean; displayId: string }
/** Input is forwarded; rendering uses accepted poses only. No local game simulation. */
export function createDisplaySession(canvas: HTMLCanvasElement, roomId: string, onView: (view: DisplaySessionView) => void) {
  const replica = new SessionReplica(roomId, crypto.randomUUID());
  const scene = new AcceptedScene();
  const keyboard = new KeyboardFlightInput(canvas);
  keyboard.setEnabled(false, { x: 0.5, y: 0.5 });
  let disposed = false, ready = false, failed = false, lastProbe = -Infinity, lastSend = -Infinity, inputSequence = 0;
  let lastAck = -Infinity;
  let lastEpoch = -1, lastRun = -1, lastOwner = "", lastRevision = -1, wasConnected = false;
  let lastEnabled = false;
  let ackSequence = 0;
  const channel = openExperimentalChannel(roomId, (message) => { if (!disposed) replica.receive(message, performance.now()); });
  const report = (now: number) => {
    const connected = replica.connected(now);
    if (wasConnected !== connected || lastOwner !== (replica.state?.ownerId ?? "") || lastRevision !== (replica.state?.revision ?? -1)) {
      wasConnected = connected; lastOwner = replica.state?.ownerId ?? ""; lastRevision = replica.state?.revision ?? -1;
      onView({ state: replica.state, connected, displayId: replica.displayId });
    }
  };
  const ack = () => {
    const state = replica.state, frame = replica.frame;
    if (!state || !frame || frame.inputEpoch !== state.inputEpoch || frame.runId !== state.runId) return;
    channel.send({ version: 4, type: "ack", sequence: ++ackSequence, displayId: replica.displayId, ownerId: state.ownerId, sessionId: state.sessionId, runId: state.runId, inputEpoch: state.inputEpoch, frameSequence: frame.sequence, visible: !document.hidden, ready });
  };
  const visibility = () => { ack(); if (document.hidden) keyboard.setEnabled(false, { x: replica.frame?.ship.controlX ?? .5, y: replica.frame?.ship.controlY ?? .5 }); };
  const driver: RemoteSceneDriver = {
    read: () => scene.state,
    rawPointer: () => replica.frame?.rawPointer ?? null,
    unavailable: () => { failed = true; ready = false; ack(); },
    presented() {
      if (disposed || failed) return;
      ready = true;
      const now = performance.now();
      if (replica.connected(now) && now - lastAck >= FRAME_INTERVAL_MS) { lastAck = now; ack(); }
    },
    update(now, delta) {
      if (disposed) return;
      if (now - lastProbe >= PROBE_INTERVAL_MS) { lastProbe = now; channel.send(replica.probe(crypto.randomUUID(), now)); }
      const connected = replica.connected(now), state = replica.state, frame = replica.frame;
      const enabled = connected && ready && !document.hidden && state?.lifecycle === "running" && state.inputMode === "keyboard" && state.primaryDisplayId === replica.displayId;
      if (!enabled || !!enabled !== lastEnabled || state?.inputEpoch !== lastEpoch || state.runId !== lastRun) {
        keyboard.setEnabled(!!enabled, { x: frame?.ship.controlX ?? .5, y: frame?.ship.controlY ?? .5 });
        lastEpoch = state?.inputEpoch ?? -1; lastRun = state?.runId ?? -1;
      }
      lastEnabled = !!enabled;
      const pointer = keyboard.sample(delta > 0 && delta <= 0.25 ? delta : 0);
      if (connected && now - lastSend >= FRAME_INTERVAL_MS) {
        lastSend = now;
        if (enabled && state && frame && frame.inputEpoch === state.inputEpoch) channel.send({ version: 4, type: "input", displayId: replica.displayId, ownerId: state.ownerId, sessionId: state.sessionId, runId: state.runId, inputEpoch: state.inputEpoch, frameSequence: frame.sequence, sequence: ++inputSequence, pointer: { ...pointer } });
      }
      scene.update(replica, now); report(now);
    },
  };
  const centerKeyboard = (event: KeyboardEvent) => { if (lastEnabled && event.code === "KeyC") { event.preventDefault(); keyboard.reset(); } };
  canvas.addEventListener("keydown", centerKeyboard);
  const close = () => {
    if (disposed) return;
    disposed = true;
    if (replica.state) channel.send({ version: 4, type: "leave", displayId: replica.displayId, ownerId: replica.state.ownerId });
    canvas.removeEventListener("keydown", centerKeyboard); keyboard.dispose(); channel.close(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", close);
  };
  document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", close);
  return { driver, dispose: close };
}
