export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export interface Video {
  videoId: string;
  title: string;
  channel: string;
}
export function validVideo(v: unknown): v is Video {
  if (!v || typeof v !== "object") return false;
  const x = v as Video;
  return (
    typeof x.videoId === "string" &&
    VIDEO_ID.test(x.videoId) &&
    typeof x.title === "string" &&
    x.title.length > 0 &&
    x.title.length <= 200 &&
    typeof x.channel === "string" &&
    x.channel.length <= 120 &&
    !/[<>]/.test(x.title + x.channel)
  );
}
export const thumbnail = (id: string) =>
  `https://i.ytimg.com/vi/${VIDEO_ID.test(id) ? id : ""}/hqdefault.jpg`;
export interface VideoCommand {
  sessionId: string;
  commandId: string;
  ownerId: string;
  controlTabId: string;
  revision: number;
  videoId: string;
  state: "playing" | "paused" | "stopped";
  position: number;
  volume: number;
  muted: boolean;
  issuedAt: number;
  heartbeatAt: number;
}
export function parseCommand(v: unknown): VideoCommand | null {
  if (!v || typeof v !== "object") return null;
  const x = v as VideoCommand;
  if (
    !["sessionId", "commandId", "ownerId", "controlTabId"].every(
      (k) =>
        typeof x[k as keyof VideoCommand] === "string" &&
        String(x[k as keyof VideoCommand]).length > 0 &&
        String(x[k as keyof VideoCommand]).length <= 100,
    )
  )
    return null;
  if (
    typeof x.videoId !== "string" ||
    !VIDEO_ID.test(x.videoId) ||
    !["playing", "paused", "stopped"].includes(x.state) ||
    typeof x.muted !== "boolean"
  )
    return null;
  if (
    ![x.revision, x.position, x.volume, x.issuedAt, x.heartbeatAt].every(
      Number.isFinite,
    ) ||
    !Number.isInteger(x.revision) ||
    x.revision < 1 ||
    x.position < 0 ||
    x.position > 86400 ||
    x.volume < 0 ||
    x.volume > 100
  )
    return null;
  return x;
}
export function commandFresh(c: VideoCommand, now: number) {
  return (
    c.heartbeatAt <= now + 10000 &&
    now - c.heartbeatAt < 15000 &&
    c.issuedAt <= now + 10000
  );
}
export function newerCommand(next: VideoCommand, old: VideoCommand | null) {
  return (
    !old ||
    (next.sessionId === old.sessionId
      ? next.revision > old.revision
      : next.issuedAt > old.issuedAt)
  );
}
export const recoveredPosition = (c: VideoCommand, now: number) =>
  Math.min(
    86400,
    c.position +
      (c.state === "playing" ? Math.max(0, now - c.issuedAt) / 1000 : 0),
  );
