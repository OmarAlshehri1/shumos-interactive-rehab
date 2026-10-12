import { ACK_INTERVAL_MS, DEFAULT_ROOM, openChannel, parseMessage, PROTOCOL_VERSION, type DisplayState } from "./protocol";
import { DisplayReplica } from "./replica";

export interface DisplayHandle {
  /** Authoritative distance (extrapolated) / speed for the render loop. */
  getDistance(): number;
  getSpeed(): number;
  getState(): DisplayState | null;
  dispose(): void;
}

/**
 * Display side: probes for Control, mirrors its authoritative state, answers with
 * acknowledgements, and exposes the extrapolated distance. Read-only: the Display
 * never selects, scores or changes the session.
 */
export function mountDisplay(onState: (state: DisplayState | null, silent: boolean) => void, room = DEFAULT_ROOM): DisplayHandle {
  const displayId = crypto.randomUUID();
  const replica = new DisplayReplica();
  let seq = 0, lastState: DisplayState | null = null, lastSilent = false, lastProbeAt = -Infinity;
  const publish = () => {
    const silent = replica.isSilent(performance.now());
    if (replica.state !== lastState || silent !== lastSilent) { lastState = replica.state; lastSilent = silent; onState(replica.state, silent); }
  };
  const channel = openChannel(room, (raw) => {
    const m = parseMessage(raw);
    if (!m) return;
    if (m.type === "sync" && m.displayId !== displayId) return;
    replica.accept(m, performance.now());
    publish();
  });
  const probe = () => { lastProbeAt = performance.now(); channel.send({ v: PROTOCOL_VERSION, type: "probe", displayId, nonce: `${displayId}:${++seq}` }); };
  const timer = window.setInterval(() => {
    const now = performance.now(), id = replica.identity;
    if (id) channel.send({ v: PROTOCOL_VERSION, type: "ack", displayId, ownerId: id.ownerId, sessionEpoch: id.sessionEpoch, runId: id.runId, revision: Math.max(0, replica.revision), seq: ++seq, visible: !document.hidden });
    if ((!id || replica.needsSync || replica.isSilent(now)) && now - lastProbeAt > 700) probe();
    publish();
  }, ACK_INTERVAL_MS);
  const onVisibility = () => { if (!document.hidden) probe(); };
  document.addEventListener("visibilitychange", onVisibility);
  probe();
  return {
    getDistance: () => replica.distance(performance.now()),
    getSpeed: () => replica.speed(performance.now()),
    getState: () => replica.state,
    dispose() { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); channel.close(); },
  };
}
