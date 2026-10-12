import { STAGES } from "./stages";
import { matches, type Guard, type State } from "./gameplay";
export const CHANNEL_PREFIX = "shumos-local-buildquest3d-v1:";
export const roomValid = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(v);
export interface InputPacket {
  type: "input";
  guard: Guard;
  client: string;
  seq: number;
  sentAt: number;
  x: number;
  y: number;
  activate: boolean;
}
export function validState(raw: unknown, session: string): raw is State {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as State;
  if (
    s.version !== 1 ||
    s.session !== session ||
    !Number.isSafeInteger(s.run) ||
    s.run < 1 ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    !Number.isInteger(s.stage) ||
    !STAGES[s.stage] ||
    !["ready", "running", "paused", "complete", "ended"].includes(s.status)
  )
    return false;
  if (
    !s.config ||
    !["mouse", "sensor", "controller"].includes(s.config.input) ||
    !["high", "medium", "low"].includes(s.config.assistance) ||
    !["high", "low"].includes(s.config.quality) ||
    !Number.isFinite(s.config.dwellMs) ||
    s.config.dwellMs < 250 ||
    s.config.dwellMs > 3000 ||
    !Number.isFinite(s.config.tolerance) ||
    s.config.tolerance < 0.65 ||
    s.config.tolerance > 1.5
  )
    return false;
  const ids = STAGES[s.stage].pieces.map((p) => p.id);
  if (
    !Array.isArray(s.placed) ||
    new Set(s.placed).size !== s.placed.length ||
    s.placed.some((id) => !ids.includes(id)) ||
    (s.selected !== null && !ids.includes(s.selected)) ||
    (s.hover !== null && !ids.includes(s.hover))
  )
    return false;
  if (
    !s.pointer ||
    ![s.pointer.x, s.pointer.y, s.dwell].every(Number.isFinite) ||
    s.pointer.x < 0 ||
    s.pointer.x > 1 ||
    s.pointer.y < 0 ||
    s.pointer.y > 1 ||
    s.dwell < 0 ||
    typeof s.inputReady !== "boolean" ||
    typeof s.feedback !== "string"
  )
    return false;
  if (
    !Array.isArray(s.events) ||
    s.events.length > 1000 ||
    new Set(s.events.map((e) => e?.id)).size !== s.events.length ||
    s.events.some(
      (e) =>
        !e ||
        typeof e.id !== "string" ||
        typeof e.pieceId !== "string" ||
        !STAGES.some(
          (t) => t.id === e.stageId && t.pieces.some((p) => p.id === e.pieceId),
        ) ||
        !Number.isSafeInteger(e.run) ||
        e.run < 1,
    )
  )
    return false;
  return [s.completed, s.skipped].every(
    (a) =>
      Array.isArray(a) &&
      new Set(a).size === a.length &&
      a.every((id) => STAGES.some((t) => t.id === id)),
  );
}
export function replicaAccept(
  current: State | null,
  next: unknown,
  session: string,
): next is State {
  return (
    validState(next, session) &&
    (!current || (next.run >= current.run && next.revision >= current.revision))
  );
}
export function validInput(
  s: State,
  raw: unknown,
  now: number,
  seen: Map<string, number>,
): raw is InputPacket {
  if (!raw || typeof raw !== "object") return false;
  const m = raw as InputPacket;
  if (
    m.type !== "input" ||
    !m.guard ||
    !matches(s, m.guard) ||
    !roomValid(m.client) ||
    !Number.isSafeInteger(m.seq) ||
    m.seq < 0 ||
    m.seq <= (seen.get(m.client) ?? -1) ||
    !Number.isFinite(m.sentAt) ||
    now - m.sentAt < 0 ||
    now - m.sentAt > 250 ||
    ![m.x, m.y].every(Number.isFinite) ||
    m.x < 0 ||
    m.x > 1 ||
    m.y < 0 ||
    m.y > 1 ||
    typeof m.activate !== "boolean"
  )
    return false;
  if (seen.size >= 32 && !seen.has(m.client)) return false;
  seen.set(m.client, m.seq);
  return true;
}
export function recover(raw: unknown, session: string): State | null {
  if (!validState(raw, session)) return null;
  return {
    ...raw,
    run: raw.run + 1,
    revision: raw.revision + 1,
    status: raw.status === "running" ? "paused" : raw.status,
    inputReady: false,
    hover: null,
    dwell: 0,
  };
}
