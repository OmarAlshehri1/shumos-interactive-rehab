import { STAGES, distance, project, type Pointer } from "./stages";
export type InputMode = "mouse" | "sensor" | "controller";
export type Assistance = "high" | "medium" | "low";
export type Status = "ready" | "running" | "paused" | "complete" | "ended";
export interface Config {
  input: InputMode;
  assistance: Assistance;
  dwellMs: number;
  tolerance: number;
  quality: "high" | "low";
}
export const DEFAULT_CONFIG: Config = {
  input: "mouse",
  assistance: "high",
  dwellMs: 650,
  tolerance: 1,
  quality: "high",
};
export const HELP = {
  high: { radius: 0.115, dwell: 650 },
  medium: { radius: 0.085, dwell: 1000 },
  low: { radius: 0.06, dwell: 1400 },
};
export interface Placement {
  id: string;
  pieceId: string;
  stageId: string;
  run: number;
}
export interface State {
  version: 1;
  session: string;
  run: number;
  revision: number;
  stage: number;
  status: Status;
  config: Config;
  pointer: Pointer;
  selected: string | null;
  placed: string[];
  events: Placement[];
  completed: string[];
  skipped: string[];
  hover: string | null;
  dwell: number;
  inputReady: boolean;
  feedback: string;
}
export interface Guard {
  session: string;
  run: number;
  stage: number;
  revision: number;
}
export function guard(s: State): Guard {
  return {
    session: s.session,
    run: s.run,
    stage: s.stage,
    revision: s.revision,
  };
}
export function matches(s: State, g: Guard): boolean {
  return (
    s.session === g.session &&
    s.run === g.run &&
    s.stage === g.stage &&
    Number.isSafeInteger(g.revision) &&
    g.revision <= s.revision &&
    s.revision - g.revision <= 30
  );
}
export function createState(
  session: string,
  stage = 0,
  config = DEFAULT_CONFIG,
): State {
  return {
    version: 1,
    session,
    run: 1,
    revision: 0,
    stage,
    status: "ready",
    config: { ...config },
    pointer: { x: 0.5, y: 0.5 },
    selected: null,
    placed: [],
    events: [],
    completed: [],
    skipped: [],
    hover: null,
    dwell: 0,
    inputReady: false,
    feedback: "لنبدأ البناء معًا",
  };
}
export function eligible(s: State, id: string): boolean {
  const p = STAGES[s.stage].pieces.find((p) => p.id === id);
  return (
    !!p &&
    !s.placed.includes(id) &&
    p.requires.every((id) => s.placed.includes(id))
  );
}
export function sourceAt(s: State, p: Pointer): string | null {
  return (
    STAGES[s.stage].pieces.find(
      (v) => eligible(s, v.id) && distance(project(v.source), p) < 0.092,
    )?.id ?? null
  );
}
function revise(s: State, patch: Partial<State>): State {
  return { ...s, ...patch, revision: s.revision + 1 };
}
export function place(s: State, id: string, eventId: string, g: Guard): State {
  if (
    !matches(s, g) ||
    s.status !== "running" ||
    s.selected !== id ||
    !eligible(s, id) ||
    !s.inputReady ||
    s.events.some((e) => e.id === eventId)
  )
    return s;
  const p = STAGES[s.stage].pieces.find((p) => p.id === id)!;
  if (
    distance(project(p.target), s.pointer) >
    HELP[s.config.assistance].radius * s.config.tolerance
  )
    return revise(s, { feedback: "اقترب من المكان المضيء، خذ وقتك" });
  const placed = [...s.placed, id],
    done = placed.length === STAGES[s.stage].pieces.length;
  return revise(s, {
    placed,
    selected: null,
    hover: null,
    dwell: 0,
    status: done ? "complete" : "running",
    events: [
      ...s.events,
      { id: eventId, pieceId: id, stageId: STAGES[s.stage].id, run: s.run },
    ],
    completed: done
      ? [...new Set([...s.completed, STAGES[s.stage].id])]
      : s.completed,
    feedback: done ? "رائع! أكملت البناء" : "أحسنت! قطعة في مكانها",
  });
}
export function input(
  s: State,
  p: Pointer | null,
  dt: number,
  activate = false,
): State {
  if (s.status !== "running") return s;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
    return s.inputReady || s.hover
      ? revise(s, {
          inputReady: false,
          hover: null,
          dwell: 0,
          feedback: "خذ استراحة، سنكمل معًا",
        })
      : s;
  p = {
    x: Math.max(0.04, Math.min(0.96, p.x)),
    y: Math.max(0.08, Math.min(0.9, p.y)),
  };
  let next = revise(s, { pointer: p, inputReady: true });
  if (
    next.selected &&
    activate &&
    distance(
      project(
        STAGES[next.stage].pieces.find((p) => p.id === next.selected)!.target,
      ),
      p,
    ) >
      HELP[next.config.assistance].radius * next.config.tolerance
  )
    return revise(next, {
      selected: null,
      hover: null,
      dwell: 0,
      feedback: "يمكنك اختيار قطعة أخرى",
    });
  if (next.selected)
    return place(
      next,
      next.selected,
      `${next.session}:${next.run}:${STAGES[next.stage].id}:${next.selected}`,
      guard(next),
    );
  const hover = sourceAt(next, p),
    dwell = hover
      ? (hover === s.hover ? s.dwell : 0) + Math.max(0, Math.min(100, dt))
      : 0;
  next = { ...next, hover, dwell };
  if (hover && (activate || dwell >= s.config.dwellMs))
    next = {
      ...next,
      selected: hover,
      hover: null,
      dwell: 0,
      feedback: "حرّك القطعة إلى المكان المضيء",
    };
  return next;
}
export type Action =
  | "start"
  | "pause"
  | "resume"
  | "restart"
  | "next"
  | "skip"
  | "end"
  | "release";
export function action(s: State, a: Action): State {
  if (a === "end")
    return revise(s, {
      status: "ended",
      selected: null,
      hover: null,
      dwell: 0,
      inputReady: false,
    });
  if (a === "restart") {
    const n = createState(s.session, s.stage, s.config);
    return {
      ...n,
      run: s.run + 1,
      revision: s.revision + 1,
      events: s.events,
      completed: s.completed,
      skipped: s.skipped,
    };
  }
  if (
    (a === "start" && s.status === "ready") ||
    (a === "resume" && s.status === "paused")
  )
    return revise(s, {
      status: "running",
      inputReady: false,
      hover: null,
      dwell: 0,
    });
  if (a === "pause" && s.status === "running")
    return revise(s, {
      status: "paused",
      inputReady: false,
      hover: null,
      dwell: 0,
    });
  if (a === "release")
    return revise(s, { selected: null, hover: null, dwell: 0 });
  if (
    (a === "next" && s.status === "complete") ||
    (a === "skip" && s.status !== "ended")
  ) {
    if (s.stage === STAGES.length - 1)
      return revise(s, { status: "ended", selected: null, inputReady: false,
        skipped: a === "skip" && !s.completed.includes(STAGES[s.stage].id)
          ? [...new Set([...s.skipped, STAGES[s.stage].id])] : s.skipped });
    return revise(s, {
      stage: s.stage + 1,
      run: s.run + 1,
      status: "ready",
      selected: null,
      placed: [],
      hover: null,
      dwell: 0,
      inputReady: false,
      pointer: { x: 0.5, y: 0.5 },
      skipped:
        a === "skip"
          ? [...new Set([...s.skipped, STAGES[s.stage].id])]
          : s.skipped,
      feedback: "لنبدأ بناءً جديدًا",
    });
  }
  return s;
}
export function configure(
  s: State,
  c: Partial<Config>,
  stage = s.stage,
): State {
  if (s.status !== "ready" && s.status !== "paused") return s;
  const config = { ...s.config, ...c };
  config.dwellMs = Math.max(250, Math.min(3000, config.dwellMs));
  config.tolerance = Math.max(0.65, Math.min(1.5, config.tolerance));
  if (!Number.isInteger(stage) || stage < 0 || stage >= STAGES.length) return s;
  if (stage !== s.stage)
    return {
      ...createState(s.session, stage, config),
      run: s.run + 1,
      revision: s.revision + 1,
      events: s.events,
      completed: s.completed,
      skipped: s.skipped,
    };
  return revise(s, { config, inputReady: false, hover: null, dwell: 0 });
}
