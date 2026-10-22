"use client";

import { FLOOR_HINT_AR, FLOOR_PAD_AR, FLOOR_RANGE_AR, floorCueTherapistAr } from "@/lib/runnerquest3d/arabic";
import type { Command, ControlRuntime, ControlView } from "@/lib/runnerquest3d/controlRuntime";
import { floorCurrent } from "@/lib/runnerquest3d/session";
import { FLOOR_CM_MAX, FLOOR_MARGIN_MAX, type FloorCalibration, type Lane, type Level3, type TherapistSettings } from "@/lib/runnerquest3d/types";
import styles from "./control.module.css";

const LEVELS: Level3[] = ["low", "normal", "high"];

type Run = (cmd: Command) => boolean;
const glyph = (code: string, i: number, now: boolean) => (now ? "◉" : code === "c" ? "✓" : code === "a" ? "✋" : code === "s" ? "–" : code === "r" ? "☾" : String(i + 1));

/** The FLOOR journey as the therapist sees it: a synchronized region map, the current objective and every manual action. */
export function FloorMapPanel({ runtime, view, run }: { runtime: ControlRuntime; view: ControlView; run: Run }) {
  const s = view.session, st = s.stage!, f = st.floor!;
  const lc = s.lifecycle;
  const playing = lc === "playing";
  const live = playing || lc === "paused";
  const cur = floorCurrent(st);
  const finished = f.current >= f.objectives.length;
  const outcomes = st.obstacles.map((o) => (!o.resolved ? "." : o.how === "assisted" ? "a" : o.how === "skipped" ? "s" : o.how === "rest" ? "r" : "c"));
  const regionLabel = (r: Lane) => (r < 0 ? "يسار" : r > 0 ? "يمين" : "المنتصف");
  const targeted = (r: Lane) => cur?.kind === "region" && cur.target === r;
  const hint = view.floorHint;
  const confirmHint = () => {
    if (!hint) return;
    runtime.manual(hint.kind === "step" ? { kind: "step" } : { kind: "region", region: hint.kind === "left" ? -1 : hint.kind === "right" ? 1 : 0 });
  };
  const resting = view.roles.length > 0 && view.roles.every((r) => r.fresh && r.state === "neutral");
  return (
    <section className={`${styles.card} ${styles.touchCard}`} data-testid="floor-card">
      <h2>خريطة الأرض <span className={styles.badge}>تحكم الأخصائي — متاح دائمًا</span></h2>
      <div style={{ fontWeight: 700, fontSize: 18 }} data-testid="floor-objective">
        {finished ? "اكتملت الرحلة" : `الهدف ${f.current + 1} من ${f.objectives.length}: ${cur ? floorCueTherapistAr(cur) : ""}`}
      </div>
      <div className={styles.note}>أكّد المنطقة التي وصل إليها الطفل فعلًا. لا توجد أخطاء ولا وقت محدد؛ المنطقة الخاطئة لا تُحتسب ولا تُعاقب.</div>
      <div className={styles.floorMap} data-testid="floor-map" data-current={f.current} data-region={f.region}>
        {([-1, 0, 1] as Lane[]).map((r) => {
          const stepGoal = cur?.kind === "step" && r === 0, restGoal = cur?.kind === "rest" && r === 0;
          return (
            <button key={r} type="button" disabled={!playing || finished} data-testid={`floor-region-${r}`} data-target={targeted(r) ? "1" : "0"}
              className={`${styles.regionBtn} ${targeted(r) ? styles.regionTarget : stepGoal ? styles.regionStep : restGoal ? styles.regionRest : ""} ${f.region === r ? styles.childHere : ""}`}
              onClick={() => runtime.manual({ kind: "region", region: r })}>
              {r < 0 ? "◀" : r > 0 ? "▶" : "●"}
              <small>{regionLabel(r)}{targeted(r) ? " — الهدف" : ""}</small>
            </button>
          );
        })}
      </div>
      <div className={styles.bigRow}>
        <button className={`${styles.bigBtn} ${styles.bigPrimary}`} data-testid="floor-step" disabled={!playing || !cur || cur.kind === "region"} onClick={() => runtime.manual({ kind: "step" })}>
          {cur?.kind === "rest" ? "متابعة بعد الاستراحة" : "أكّد الحركة الصغيرة"}
        </button>
        <button className={`${styles.bigBtn} ${styles.bigWarn}`} data-testid="floor-assist" disabled={!live || finished} onClick={() => run({ type: "assist" })}>تأكيد بمساعدة</button>
        <button className={styles.bigBtn} data-testid="floor-repeat" disabled={!live || finished} onClick={() => run({ type: "repeat" })}>إعادة التلميح</button>
        <button className={styles.bigBtn} data-testid="floor-skip-objective" disabled={!live || finished} onClick={() => run({ type: "skip-objective" })}>تخطّي الهدف</button>
      </div>
      <div className={styles.route} data-testid="floor-route" aria-label="مسار الرحلة">
        {outcomes.map((o, i) => (
          <span key={i} className={`${styles.routeDot} ${i === f.current && !finished ? styles.routeNow : o === "c" ? styles.routeDone : o === "a" ? styles.routeAssist : o === "s" ? styles.routeSkip : o === "r" ? styles.routeRest : ""}`}>{glyph(o, i, i === f.current && !finished)}</span>
        ))}
      </div>
      <div className={styles.note}>✓ تم · ✋ بمساعدة · – تخطّي · ☾ استراحة · ◉ الهدف الحالي. المساعدة تحتسب النجمة ويُسجَّل أنها بمساعدة؛ التخطّي لا يحتسب نجمة ويُسجَّل منفصلًا.</div>
      {hint && (
        <div className={styles.hintBox} data-testid="floor-hint">
          <span>{FLOOR_HINT_AR[hint.kind]} — اقتراح فقط؛ تأكّد من حركة الطفل ثم أكّد.</span>
          {playing && <button className={styles.btn} data-testid="floor-hint-confirm" onClick={confirmHint}>أكّد هذا الاقتراح</button>}
        </div>
      )}
      {view.roles.length > 0 && <div className={styles.note} data-testid="floor-rest">{resting ? "القدم في وضع الراحة." : "القدم تتحرك أو لم تستقر بعد."} المؤشرات تلميحات حركة فقط ولا تحدد موضع الطفل على الأرض.</div>}
    </section>
  );
}

/** Region size / spacing / margins / grid / contrast. Presentation only; physical projector measurement is the therapist's. */
export function FloorCalibrationCard({ set, patchFloor }: { set: TherapistSettings; patchFloor: (p: Partial<FloorCalibration>) => void }) {
  const f = set.floor;
  return (
    <section className={styles.card} data-testid="floor-calibration">
      <h2>إعداد العرض الأرضي</h2>
      <div className={styles.field}>
        <label className={styles.label}>مدى الحركة (المسافة بين المناطق)</label>
        <div className={styles.row}>{LEVELS.map((l) => <button key={l} className={`${styles.chip} ${f.range === l ? styles.chipOn : ""}`} style={{ minHeight: 44 }} data-testid={`floor-range-${l}`} onClick={() => patchFloor({ range: l })}>{FLOOR_RANGE_AR[l]}</button>)}</div>
        <div className={styles.note}>«قريبة» تحتاج حركة أصغر من الطفل.</div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>حجم المناطق</label>
        <div className={styles.row}>{LEVELS.map((l) => <button key={l} className={`${styles.chip} ${f.pad === l ? styles.chipOn : ""}`} style={{ minHeight: 44 }} data-testid={`floor-pad-${l}`} onClick={() => patchFloor({ pad: l })}>{FLOOR_PAD_AR[l]}</button>)}</div>
        <div className={styles.note}>كل الأحجام كبيرة؛ لا توجد أهداف صغيرة.</div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>الهامش الآمن: {Math.round(f.margin * 100)}٪</label>
        <input className={styles.slider} type="range" data-testid="floor-margin" min={0} max={FLOOR_MARGIN_MAX} step={0.01} value={f.margin} onChange={(e) => patchFloor({ margin: Number(e.target.value) })} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>أبعاد الإسقاط المقاسة (سم)</label>
        <div className={styles.row}>
          <input className={styles.numInput} style={{ flex: 1 }} type="number" inputMode="numeric" min={0} max={FLOOR_CM_MAX} data-testid="floor-width-cm" placeholder="العرض" value={f.widthCm || ""} onChange={(e) => patchFloor({ widthCm: Number(e.target.value) || 0 })} />
          <input className={styles.numInput} style={{ flex: 1 }} type="number" inputMode="numeric" min={0} max={FLOOR_CM_MAX} data-testid="floor-height-cm" placeholder="الارتفاع" value={f.heightCm || ""} onChange={(e) => patchFloor({ heightCm: Number(e.target.value) || 0 })} />
        </div>
        <div className={styles.note}>أدخل القياس الذي قسته بنفسك على الأرض؛ يُستخدم فقط لتقسيم شبكة المعايرة إلى مربعات ٥٠ سم. البرنامج لا يقيس الإسقاط الفعلي.</div>
      </div>
      <label className={styles.field} style={{ display: "block" }}><input type="checkbox" data-testid="floor-grid" checked={f.grid} onChange={(e) => patchFloor({ grid: e.target.checked })} /> إظهار شبكة المعايرة والهامش الآمن <div className={styles.note}>الدائرة الحمراء يجب أن تبدو دائرة على الأرض؛ إن بدت بيضاوية فالإسقاط مشوَّه.</div></label>
      <label className={styles.field} style={{ display: "block" }}><input type="checkbox" data-testid="floor-contrast" checked={f.highContrast} onChange={(e) => patchFloor({ highContrast: e.target.checked })} /> تباين عالٍ</label>
      <label className={styles.field} style={{ display: "block" }}><input type="checkbox" data-testid="floor-guidance" checked={f.guidance} onChange={(e) => patchFloor({ guidance: e.target.checked })} /> إرشادات إضافية (نقاط اتجاه بين الطفل والهدف)</label>
    </section>
  );
}
