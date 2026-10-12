import { SESSION_CHANNEL_PREFIX, type SessionMessage } from "./sessionContract";

export function openExperimentalChannel(roomId: string, receive: (message: unknown) => void) {
  if (typeof BroadcastChannel !== "function") throw new Error("This browser does not support local session communication.");
  const channel = new BroadcastChannel(`${SESSION_CHANNEL_PREFIX}${roomId}`);
  let closed = false;
  channel.onmessage = (event: MessageEvent<unknown>) => { if (!closed) receive(event.data); };
  return {
    send(message: SessionMessage) { if (!closed) channel.postMessage(message); },
    close() { if (closed) return; closed = true; channel.onmessage = null; channel.close(); },
  };
}
