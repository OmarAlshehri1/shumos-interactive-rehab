"use client";
import { eligible, type State } from "@/lib/buildquest3d/gameplay";
import { STAGES, type Pointer } from "@/lib/buildquest3d/stages";
import styles from "@/components/display/buildquest3d/workshop.module.css";

export function ManualWorkbench({ state, enabled, select, place, move }: {
  state: State; enabled: boolean; select: (id: string) => void; place: (id: string) => void; move: (p: Pointer) => void;
}) {
  const pieces = STAGES[state.stage].pieces;
  const step = (x: number, y: number) => move({ x: state.pointer.x + x, y: state.pointer.y + y });
  return <section className={styles.manual} aria-label="التحكم اليدوي للأخصائي">
    <h2>التحكم اليدوي · متاح مع جميع طرق الإدخال</h2>
    <p>اختر قطعة، ثم حرّكها باللمس أو بالأسهم، أو المس مكانها لوضعها. لا تحتاج إلى حساس.</p>
    <div className={styles.manualGrid}>
      <div><h3>القطع المتاحة</h3><div className={styles.pieceButtons}>
        {pieces.map(p => <button key={p.id} type="button" data-piece={p.id} aria-pressed={state.selected === p.id}
          disabled={!enabled || !eligible(state, p.id)} onClick={() => select(p.id)}>
          <span aria-hidden="true" style={{ background: p.color }} />{p.label}{state.placed.includes(p.id) ? " ✓" : ""}
        </button>)}
      </div></div>
      <div><h3>أماكن البناء</h3><div className={styles.pieceButtons}>
        {pieces.map(p => <button key={p.id} type="button" data-target={p.id} disabled={!enabled || state.selected !== p.id || !eligible(state, p.id)}
          onClick={() => place(p.id)}>وضع {p.label}{state.placed.includes(p.id) ? " ✓" : ""}</button>)}
      </div></div>
    </div>
    <div className={styles.moveButtons} aria-label="تحريك القطعة المختارة">
      {[[0,-.025,"↑","أعلى"],[-.025,0,"←","يسار"],[.025,0,"→","يمين"],[0,.025,"↓","أسفل"]].map(([x,y,icon,label]) =>
        <button key={label} type="button" aria-label={`تحريك ${label}`} disabled={!enabled || !state.selected} onClick={() => step(Number(x),Number(y))}>{icon}</button>)}
    </div>
  </section>;
}
