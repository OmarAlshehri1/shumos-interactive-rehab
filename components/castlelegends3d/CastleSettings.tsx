"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { EXERCISES, type Mode, type Side } from "@/lib/castlelegends3d/curriculum";
import { LIMBS, type Config, type State } from "@/lib/castlelegends3d/engine";
import { TherapistDisclosure } from "@/components/control/ui/TherapistSurface";
import ui from "@/components/control/ui/therapist.module.css";
const limbNames = { rightArm: "الذراع اليمنى", leftArm: "الذراع اليسرى", rightLeg: "الساق اليمنى", leftLeg: "الساق اليسرى" };
function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return <label className={ui.field} htmlFor={props.id}>{label}<select {...props}>{children}</select></label>;
}
export function CastleSettings({ state: s, enabled, configure }: { state: State; enabled: boolean; configure: (patch: Partial<Config>) => void }) {
  const editable = enabled && ["ready", "paused"].includes(s.status);
  return <div className={ui.stack}>
    <div className={ui.fieldGrid}>
      <ControlSlot slot="settings"><SelectField id="castle-mode" label="نمط الحركة" value={s.config.mode} disabled={!editable} onChange={e => configure({ mode: e.target.value as Mode, exercises: [], limbs: [...LIMBS] })}>
        <option value="hands">الذراعان فقط</option><option value="legs">الساقان فقط</option><option value="combined">حركات مشتركة</option>
      </SelectField></ControlSlot>
      <ControlSlot slot="settings"><SelectField id="castle-side" label="الجهة المشاركة" value={s.config.side} disabled={!editable} onChange={e => configure({ side: e.target.value as Side, exercises: [] })}>
        <option value="bilateral">الجهتان حسب الحركة</option><option value="right">اليمنى فقط</option><option value="left">اليسرى فقط</option>
      </SelectField></ControlSlot>
      <SelectField id="castle-presentation" label="وضعية عرض المدرب" value={s.config.presentation} disabled={!editable} onChange={e => configure({ presentation: e.target.value as Config["presentation"] })}>
        <option value="seated">جالس · مع بدائل مريحة</option><option value="standing">واقف · بتوجيه المعالج</option>
      </SelectField>
      <ControlSlot slot="settings"><SelectField id="castle-range" label="حجم الحركة المعروضة" value={s.config.movementScale} disabled={!editable} onChange={e => configure({ movementScale: Number(e.target.value) })}>
        <option value="0.35">صغيرة</option><option value="0.65">مريحة</option><option value="1">كاملة</option>
      </SelectField></ControlSlot>
      <SelectField id="castle-reps" label="التكرارات في كل جولة" value={s.config.repetitions} disabled={!enabled || s.status !== "ready"} onChange={e => configure({ repetitions: Number(e.target.value) })}>
        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} حركات</option>)}
      </SelectField>
      <label className={ui.choice}><input type="checkbox" checked={s.config.reducedMotion} disabled={!editable} onChange={e => configure({ reducedMotion: e.target.checked })} />تقليل الحركة البصرية</label>
    </div>
    <fieldset className={ui.group} disabled={!editable}><legend>الأطراف المشاركة</legend><div className={ui.choices}>{LIMBS.map(limb => <label className={ui.choice} key={limb}><input type="checkbox" checked={s.config.limbs.includes(limb)} onChange={e => configure({ limbs: e.target.checked ? [...s.config.limbs, limb] : s.config.limbs.filter(l => l !== limb) })} />{limbNames[limb]}</label>)}</div></fieldset>
    <p className={ui.safety}>اختر حركة مريحة وآمنة. تأكيد الأداء بيد المعالج؛ لا يوجد قياس تلقائي للحركة أو تحميل الوزن.</p>
    <TherapistDisclosure>
      <fieldset className={ui.group} disabled={!editable}><legend>تخصيص الحركات</legend><p className={ui.hint}>اترك الاختيار فارغًا للتنويع التلقائي.</p><div className={ui.choices}>{EXERCISES.filter(e => e.mode === s.config.mode && (!e.mat || s.config.mat)).map(e => <label className={ui.choice} key={e.id}><input type="checkbox" checked={s.config.exercises.includes(e.id)} onChange={v => configure({ exercises: v.target.checked ? [...s.config.exercises, e.id] : s.config.exercises.filter(id => id !== e.id) })} />{e.name}</label>)}</div></fieldset>
      <SelectField id="castle-hold" label="ثبات اختياري بإشراف المعالج" value={s.config.holdSeconds} disabled={!editable} onChange={e => configure({ holdSeconds: Number(e.target.value) })}>
        {[0, 2, 3, 5].map(n => <option key={n} value={n}>{n ? `${n} ثوانٍ` : "دون ثبات"}</option>)}
      </SelectField>
      <fieldset className={ui.group} disabled={!editable}><legend>حصيرة البصمات</legend><label className={ui.choice}><input type="checkbox" checked={s.config.mat} onChange={e => configure({ mat: e.target.checked, exercises: [] })} />تمارين الحصيرة بتأكيد المعالج</label>
        <SelectField label="هدف الحصيرة" id="castle-mat-target" value={s.config.matTarget} disabled={!s.config.mat || !editable} onChange={e => configure({ matTarget: e.target.value as Config["matTarget"] })}><option value="blue">الدائرة الزرقاء</option><option value="orange">الدائرة البرتقالية</option><option value="green">الدائرة الخضراء</option></SelectField>
      </fieldset>
      <SelectField id="castle-quality" label="جودة الرسوم" value={s.config.quality} disabled={!editable} onChange={e => configure({ quality: e.target.value as Config["quality"] })}><option value="high">عالية · ظلال وتفاصيل</option><option value="low">خفيفة · للأجهزة الأبطأ</option></SelectField>
      <label className={ui.choice}><input type="checkbox" checked={s.config.muted} disabled={!editable} onChange={e => configure({ muted: e.target.checked })} />كتم الصوت</label>
      <label className={ui.field}>مستوى الصوت<input aria-label="مستوى الصوت" type="range" min="0" max="1" step=".05" value={s.config.volume} disabled={!editable} onChange={e => configure({ volume: Number(e.target.value) })} /></label>
    </TherapistDisclosure>
  </div>;
}
