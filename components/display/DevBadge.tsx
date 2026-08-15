import type { GameState } from "@/lib/game";

/**
 * TASK 3 LOCAL DEMO ONLY. A small, discreet corner label so the state
 * machine can be inspected while testing — never part of the projected
 * child experience. Hidden outright in a production build; the underlying
 * keyboard shortcuts (see lib/demo/useLocalDemoSession.ts) still work in
 * every environment, since nothing else can drive /display without
 * Firebase yet.
 */
export function DevBadge({ gameState }: { gameState: GameState }) {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-50 rounded bg-black/40 px-2 py-1 font-mono text-[10px] leading-tight text-white/70">
      <div>{gameState}</div>
      <div className="text-white/50">space/enter · R restart · S skip · P pause · E end</div>
    </div>
  );
}
