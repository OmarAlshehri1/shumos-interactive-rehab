import { BalloonArt3D } from "./BalloonArt3D";
import { PREVIEW_COLORS, type PreviewColor, type PreviewModeConfig } from "./previewConfig";

interface PreviewHudProps {
  config: PreviewModeConfig;
  target: PreviewColor;
  stage: 1 | 2 | 3;
  goalDone: number;
  showSymbols: boolean;
}

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥"];

/**
 * Minimal child-facing HUD (RTL): title + difficulty/stage markers, the single
 * target instruction, and a segmented goal bar. No timers, scores, counts of
 * mistakes or diagnostics. State is conveyed by shape/number as well as colour.
 */
export function PreviewHud({ config, target, stage, goalDone, showSymbols }: PreviewHudProps) {
  const def = PREVIEW_COLORS[target];
  return (
    <>
      <div className="bq3-hud-top" dir="rtl">
        <div className="bq3-pill bq3-title">مغامرة البالونات</div>

        <div className="bq3-pill bq3-instruction" role="status">
          <span className="bq3-instruction-icon">
            <BalloonArt3D color={target} showSymbol={showSymbols} withString={false} />
          </span>
          <span>المس البالون {def.adjectiveAr}</span>
        </div>

        <div className="bq3-pill bq3-level">
          <span className="bq3-level-name">{config.labelAr}</span>
          <ol className="bq3-stages" aria-label={`المرحلة ${ARABIC_DIGITS[stage]} من ٣`}>
            {[1, 2, 3].map((n) => (
              <li key={n} className={n < stage ? "is-done" : n === stage ? "is-current" : ""}>
                {n < stage ? "✓" : ARABIC_DIGITS[n]}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="bq3-hud-bottom" dir="rtl">
        <div className="bq3-pill bq3-goal" role="progressbar" aria-valuemin={0} aria-valuemax={config.goalTotal} aria-valuenow={goalDone}>
          <div className="bq3-segments">
            {Array.from({ length: config.goalTotal }, (_, i) => (
              <span key={i} className={i < goalDone ? "is-filled" : ""}>
                {i < goalDone ? "★" : ""}
              </span>
            ))}
          </div>
          <span className="bq3-goal-text">
            {ARABIC_DIGITS[goalDone]} من {ARABIC_DIGITS[config.goalTotal]}
          </span>
        </div>
      </div>
    </>
  );
}
