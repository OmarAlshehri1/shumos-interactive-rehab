import { ACK_INTERVAL_MS, DEFAULT_ROOM, openChannel, parseMessage, PROTOCOL_VERSION, type DisplayState } from "./protocol";
import { DisplayReplica } from "./replica";

export interface DisplayHandle {
  /** Current authoritative simulation time (extrapolated), for the render loop. */
  getSimTimeMs(): number;
  dispose(): void;
}

/**
 * Display side: probes for Control, mirrors its authoritative state, answers
 * with acknowledgements, and exposes the extrapolated simulation clock.
 * Read-only: the Display never selects, scores or changes the session.
 */
export function mountDisplay(onState: (state: DisplayState | null, silent: boolean) => void): DisplayHandle {
  const displayId = crypto.randomUUID();
  const replica = new DisplayReplica();
  let seq = 0;
  let lastState: DisplayState | null = null;
  let lastSilent = false;
  let lastProbeAt = -Infinity;
  const publish = () => {
    const silent = replica.isSilent(performance.now());
    if (replica.state !== lastState || silent !== lastSilent) {
      lastState = replica.state;
      lastSilent = silent;
      onState(replica.state, silent);
    }
  };
  const channel = openChannel(DEFAULT_ROOM, (raw) => {
    const m = parseMessage(raw);
    if (!m) return;
    if (m.type === "sync" && m.displayId !== displayId) return; // another Display's reply
    replica.accept(m, performance.now());
    publish();
  });
  const probe = () => {
    lastProbeAt = performance.now();
    channel.send({ v: PROTOCOL_VERSION, type: "probe", displayId, nonce: `${displayId}:${++seq}` });
  };
  const timer = window.setInterval(() => {
    const now = performance.now();
    const id = replica.identity;
    if (id) channel.send({ v: PROTOCOL_VERSION, type: "ack", displayId, ownerId: id.ownerId, sessionEpoch: id.sessionEpoch, runId: id.runId, revision: Math.max(0, replica.revision), seq: ++seq, visible: !document.hidden });
    // Keep looking for Control until synced, after message loss, or if Control went quiet.
    if ((!id || replica.needsSync || replica.isSilent(now)) && now - lastProbeAt > 700) probe();
    publish();
  }, ACK_INTERVAL_MS);
  const onVisibility = () => {
    if (!document.hidden) probe();
  };
  document.addEventListener("visibilitychange", onVisibility);
  probe();
  return {
    getSimTimeMs: () => replica.simTime(performance.now()),
    dispose() {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      channel.close();
    },
  };
}
