import { arabicNumber, DIFFICULTY_AR } from "@/lib/balloonquest/arabic";
import type { DisplayState } from "@/lib/balloonquest/protocol";

/** Calm full-stage overlays for the non-playing states. Child-friendly Arabic only: no technical reasons, no diagnostics. */
export function BalloonQuestScenes({ state }: { state: DisplayState }) {
  switch (state.lifecycle) {
    case "ready":
      return (
        <div className="bq3g-overlay bq3g-welcome" dir="rtl">
          <div className="bq3g-card">
            <h1>مغامرة البالونات</h1>
            <h2>
              المستوى {DIFFICULTY_AR[state.difficulty]} — المرحلة {arabicNumber(state.stage)}
            </h2>
            <p>استعد!</p>
          </div>
        </div>
      );
    case "paused":
      return (
        <div className="bq3g-overlay" dir="rtl" role="status">
          <div className="bq3g-card">
            <h2>استراحة قصيرة</h2>
          </div>
        </div>
      );
    case "suspended":
      return (
        <div className="bq3g-overlay" dir="rtl" role="status">
          <div className="bq3g-card">
            <h2>لحظة من فضلك…</h2>
          </div>
        </div>
      );
    case "stage-complete":
      return (
        <div className="bq3g-overlay" dir="rtl" role="status">
          <div className="bq3g-card">
            <h1>أحسنت!</h1>
            <h2>أكملت المرحلة {arabicNumber(state.stage)}</h2>
            <div className="bq3g-stars" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= state.stage ? "" : "is-skipped"}>
                  ★
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    case "completed":
    case "ended": {
      const s = state.summary;
      return (
        <div className="bq3g-overlay" dir="rtl" role="status">
          <div className="bq3g-card">
            <h1>{state.lifecycle === "completed" ? "أحسنت! أكملت المغامرة" : "شكرًا لك! أحسنت"}</h1>
            {s && s.stages.length > 0 && (
              <div className="bq3g-stars" aria-label={`${arabicNumber(s.completedStages)} مراحل مكتملة`}>
                {s.stages.map((r, i) => (
                  <span key={i} className={r.status === "completed" ? "" : "is-skipped"} aria-hidden="true">
                    ★
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
