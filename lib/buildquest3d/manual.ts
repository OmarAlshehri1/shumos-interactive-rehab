import { action, eligible, guard, input, matches, type Guard, type State } from "./gameplay";
import { project, STAGES } from "./stages";

export interface ManualCommand { version: 1; kind: "select" | "place"; pieceId: string; guard: Guard }
/** Touch and assist buttons use the same eligibility, target tolerance and placement acceptance as sensors. */
export function applyManual(s: State, c: ManualCommand): State {
  if (c.version !== 1 || !matches(s, c.guard) || s.status !== "running" || !eligible(s, c.pieceId)) return s;
  const p = STAGES[s.stage].pieces.find(p => p.id === c.pieceId)!;
  if (c.kind === "select") return input(action(s, "release"), project(p.source), 0, true);
  if (c.kind === "place" && s.selected === c.pieceId) return input(s, project(p.target), 0);
  return s;
}
export function manualCommand(s: State, kind: ManualCommand["kind"], pieceId: string): ManualCommand {
  return { version: 1, kind, pieceId, guard: guard(s) };
}
