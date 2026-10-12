import { arabicNumber, DIFFICULTY_AR } from "@/lib/balloonquest/arabic";
import { BALLOON_COLOR_DEFS } from "@/lib/balloonquest/colors";
import type { DisplayState } from "@/lib/balloonquest/protocol";
import { BalloonArt3D } from "../preview/BalloonArt3D";

function GoalBar({ state }: { state: DisplayState }) {
  return (
    <div className="bq3-pill bq3-goal" role="progressbar" aria-valuemin={0} aria-valuemax={state.goal} aria-valuenow={state.goalDone}>
      <div className="bq3-segments">
        {Array.from({ length: state.goal }, (_, i) => (
          <span key={i} className={i < state.goalDone ? "is-filled" : ""}>
            {i < state.goalDone ? "★" : ""}
          </span>
        ))}
      </div>
      <span className="bq3-goal-text">
        {arabicNumber(state.goalDone)} من {arabicNumber(state.goal)}
      </span>
    </div>
  );
}

/**
 * Minimal child HUD (RTL): title, one instruction, level + three stage markers,
 * segmented goal. No timers, no scores, no mistakes, no diagnostics. State is
 * shown by number and shape as well as colour.
 */
export function GameHud({ state, showSymbols }: { state: DisplayState; showSymbols: boolean }) {
  const def = BALLOON_COLOR_DEFS[state.target];
  return (
    <>
      <div className="bq3-hud-top" dir="rtl">
        <div className="bq3-pill bq3-title">مغامرة البالونات</div>
        <div className="bq3-pill bq3-instruction" role="status">
          <span className="bq3-instruction-icon">
            <BalloonArt3D color={state.target} showSymbol={showSymbols} withString={false} />
          </span>
          <span>المس البالون {def.adjectiveAr}</span>
        </div>
        <div className="bq3-pill bq3-level">
          <span className="bq3-level-name">{DIFFICULTY_AR[state.difficulty]}</span>
          <ol className="bq3-stages" aria-label={`المرحلة ${arabicNumber(state.stage)} من ٣`}>
            {[1, 2, 3].map((n) => (
              <li key={n} className={n < state.stage ? "is-done" : n === state.stage ? "is-current" : ""}>
                {n < state.stage ? "✓" : arabicNumber(n)}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {state.layout === "WALL" ? (
        <div className="bq3-hud-bottom" dir="rtl">
          <GoalBar state={state} />
        </div>
      ) : (
        <div className="bq3g-floor-goal" dir="rtl">
          <GoalBar state={state} />
        </div>
      )}
      {state.correctSeq > 0 && state.lifecycle === "playing" && (
        <div key={state.correctSeq} className="bq3g-toast" dir="rtl" role="status">
          <span aria-hidden="true">★</span> أحسنت!
        </div>
      )}
    </>
  );
}
