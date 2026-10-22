export const TAB_SHARE_PATH = "youtubeTabShare";
export const TAB_SHARE_CHANNEL = "shumos.youtube.tab-share.v1";
export const SHARE_TTL_MS = 30_000;
export const SHARE_REFRESH_MS = 10_000;
export const RECONNECT_MS = 10_000;

export interface TabShare {
  sessionId: string;
  ownerId: string;
  controlTabId: string;
  displayUid: string;
  displayInstance: string;
  createdAt: number;
  expiresAt: number;
  hidden: boolean;
  offer: string;
  answer?: { sessionId: string; sdp: string };
  playback?: { sessionId: string; state: "playing" | "blocked" | "hidden" };
}
export interface Receiver {
  kind: "receiver";
  instance: string;
  epoch: string;
  uid: string;
  owner: string;
}
export type ShareMessage = Receiver | { kind: "discover" } |
  { kind: "connect" | "stop"; instance: string; sessionId: string } |
  { kind: "gone"; instance: string; epoch: string };
export const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export const validSdp = (value: unknown): value is string => typeof value === "string" && value.startsWith("v=0\r\n") && value.length <= 20_000;
export function parseShare(raw: unknown): TabShare | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as TabShare;
  if (![s.sessionId, s.ownerId, s.controlTabId, s.displayUid, s.displayInstance].every(validId) ||
    !Number.isFinite(s.createdAt) || !Number.isFinite(s.expiresAt) || s.expiresAt <= s.createdAt ||
    typeof s.hidden !== "boolean" || !validSdp(s.offer) ||
    (s.answer !== undefined && (s.answer?.sessionId !== s.sessionId || !validSdp(s.answer?.sdp))) ||
    (s.playback !== undefined && (s.playback?.sessionId !== s.sessionId || !["playing", "blocked", "hidden"].includes(s.playback?.state)))) return null;
  return s;
}
export function parseShareMessage(raw: unknown): ShareMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.kind === "discover") return { kind: "discover" };
  if (m.kind === "receiver" && [m.instance, m.epoch, m.uid, m.owner].every(validId)) return m as unknown as Receiver;
  if ((m.kind === "connect" || m.kind === "stop") && validId(m.instance) && validId(m.sessionId)) return m as unknown as ShareMessage;
  if (m.kind === "gone" && validId(m.instance) && validId(m.epoch)) return m as unknown as ShareMessage;
  return null;
}
export function receiverInstance(): string {
  const key = "shumos.youtube.display-instance";
  try {
    const old = sessionStorage.getItem(key);
    if (validId(old)) return old;
    const id = crypto.randomUUID(); sessionStorage.setItem(key, id); return id;
  } catch { return crypto.randomUUID(); }
}
export function nativeTabCaptureSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof RTCPeerConnection === "function" && typeof BroadcastChannel === "function" &&
    !/Android|iPhone|iPad|iPod/.test(navigator.userAgent) && /Chrome\//.test(navigator.userAgent);
}
/** Native picker hints are not permissions and cannot select YouTube on the user's behalf. */
export const TAB_CAPTURE_OPTIONS = {
  video: { displaySurface: "browser", frameRate: { ideal: 24, max: 30 } },
  audio: { suppressLocalAudioPlayback: true },
  selfBrowserSurface: "exclude", monitorTypeSurfaces: "exclude",
  surfaceSwitching: "exclude", systemAudio: "exclude",
} as DisplayMediaStreamOptions;
