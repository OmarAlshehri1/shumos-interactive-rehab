"use client";
import { LIMBS, type Config, type State } from "@/lib/castlelegends3d/engine";
import ui from "@/components/control/ui/therapist.module.css";
const limbNames = { rightArm: "اليد اليمنى", leftArm: "اليد اليسرى", rightLeg: "القدم اليمنى", leftLeg: "القدم اليسرى" };
export function CastleSettings({ state: s, enabled, configure }: { state: State; enabled: boolean; configure: (patch: Partial<Config>) => void }) {
  const editable = enabled && ["ready", "paused"].includes(s.status);
  return <div className={ui.stack}>
    <fieldset className={ui.group} disabled={!editable}><legend>الأطراف المشاركة</legend><div className={ui.choices}>{LIMBS.map(limb => <label className={ui.choice} key={limb}><input type="checkbox" checked={s.config.limbs.includes(limb)} disabled={s.config.limbs.length === 1 && s.config.limbs.includes(limb)} onChange={e => configure({ limbSelection: true, side: "bilateral", exercises: [], limbs: e.target.checked ? [...s.config.limbs, limb] : s.config.limbs.filter(l => l !== limb) })} />{limbNames[limb]}</label>)}</div></fieldset>
    <label className={ui.field} htmlFor="castle-reps">الحركات لكل طور من المواجهة<select id="castle-reps" value={s.config.repetitions} disabled={!enabled || s.status !== "ready"} onChange={e => configure({ repetitions: Number(e.target.value) })}>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    <p className={ui.safety}>تأكيد الحركة بيد الأخصائي؛ لا يوجد قياس تلقائي للحركة أو تحميل الوزن.</p>
  </div>;
}
