'use client';
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { useEffect, useState } from 'react';
import { COURSES, SELECTABLE_COURSES } from '@/lib/turngo3d/courses';
import { LIMITS, type Config } from '@/lib/turngo3d/config';
import type { Command, State } from '@/lib/turngo3d/engine';
import { schedule } from '@/lib/turngo3d/engine';
import { cmPerUnit, configFromProfile, loadFloorProfiles, type ProjectionProfileLike } from '@/lib/turngo3d/projectionProfile';
import { STAGES } from '@/lib/turngo3d/stages';
import { rolesForMode, type FootRole } from '@/lib/safehexarena3d/sensorInput';
import type { SimState } from '@/lib/turngo3d/useSession';
import styles from './control.module.css';

const ROLE_NAME: Record<FootRole, string> = { RIGHT_FOOT: 'القدم اليمنى', LEFT_FOOT: 'القدم اليسرى' };
const ROTATIONS: { v: 0 | 90 | 180 | 270; label: string }[] = [{ v: 0, label: '→ يمين' }, { v: 90, label: '↑ أعلى' }, { v: 180, label: '← يسار' }, { v: 270, label: '↓ أسفل' }];
const COURSE_LABEL: Record<string, string> = { auto: 'تخطيط المرحلة نفسها', straight: 'مستقيم · بلا أقماع', one: 'مخروط واحد', two: 'مخروطان', three: 'ثلاثة أقماع', four: 'أربعة أقماع', slalom: 'سلالوم بسيط (٥ أقماع)', sShape: 'مسار S (٣ أقماع)', curve: 'مسار منحنٍ (مخروطان)' };

interface Props { s: State; send: (c: Command) => void; sim: SimState; setSim: (p: Partial<SimState>) => void }

/** Every therapist setting. Settings that change the route are locked once a stage is running: the route never moves under a walking child. */
export function Settings({ s, send, sim, setSim }: Props) {
  const c = s.config;
  const sch = schedule(s);
  const editable = s.status !== 'ended';
  const structural = s.status === 'ready';
  const cfg = (config: Partial<Config>) => send({ type: 'configure', config });
  const [profiles, setProfiles] = useState<ProjectionProfileLike[]>([]);
  useEffect(() => { queueMicrotask(() => setProfiles(loadFloorProfiles())); }, []);
  const roles = c.inputSource === 'simulated' ? rolesForMode(c.inputMode) : [];
  const stage = STAGES[s.stage];
  const manual = Object.keys(c.cones).length + Object.keys(c.cpPos).length + (c.start ? 1 : 0) + (c.finish ? 1 : 0);
  const cm = cmPerUnit(c.proj);

  return (
    <aside className={`${styles.card} ${styles.panel}`} data-testid="tg-settings">
      <h2 style={{ margin: 0, fontSize: 18 }}>إعدادات الجلسة</h2>
      {!structural && <p className={styles.note}>خيارات المسار والأقماع تُقفل بعد بدء المرحلة كي لا يتغيّر الطريق أمام طفل يمشي. أوقف المرحلة أو أعد ضبطها لتعديلها.</p>}

      <details open>
        <summary>المسار والأقماع</summary>
        <label htmlFor="tg-course">تخطيط الأقماع</label>
        <select id="tg-course" data-testid="tg-course" value={c.course} disabled={!structural} onChange={(e) => cfg({ course: e.target.value as Config['course'] })}>
          <option value="auto">{COURSE_LABEL.auto} · {COURSES[stage.course].nameAr}</option>
          {SELECTABLE_COURSES.map((k) => <option key={k} value={k}>{COURSE_LABEL[k]}</option>)}
        </select>
        <p className={styles.note}>التخطيط الحالي: {COURSES[sch.course].nameAr} · {sch.coneCount} {sch.coneCount === 1 ? 'مخروط' : 'أقماع'} · {sch.plan.cps.length} نجوم. اسحب الأقماع والنجوم على الخريطة لتطابق الأقماع الحقيقية.</p>
        <label>اتجاه سير الطفل على الأرض</label>
        <div className={styles.seg} role="group" aria-label="اتجاه المسار">
          {ROTATIONS.map((r) => <button key={r.v} type="button" data-testid={`tg-rot-${r.v}`} className={`${styles.segBtn} ${c.rot === r.v ? styles.segOn : ''}`} disabled={!structural} aria-pressed={c.rot === r.v} onClick={() => cfg({ rot: r.v })}>{r.label}</button>)}
        </div>
        <label className={styles.check}><input type="checkbox" data-testid="tg-mirror" checked={c.mirror} disabled={!structural} onChange={(e) => cfg({ mirror: e.target.checked })} /> اقلب المسار (يمين ⇄ يسار)</label>
        <p className={styles.note}>السهم الأخضر على الخريطة يبيّن اتجاه البداية. ضع الطفل عند علامة «البداية» ووجهه نحو السهم؛ الاتجاهات «يمين/يسار» تُحسب بالنسبة لجسمه لا للشاشة.</p>
        <label htmlFor="tg-width">عرض الممر: {(c.width ?? stage.width).toFixed(1)} وحدة {c.width === null ? '(الافتراضي)' : ''}</label>
        <input id="tg-width" data-testid="tg-width" type="range" min={LIMITS.width[0]} max={LIMITS.width[1]} step="0.2" value={c.width ?? stage.width} disabled={!editable} onChange={(e) => cfg({ width: Number(e.target.value) })} />
        <p className={styles.note}>يضيق الممر المرسوم تلقائيًا ليبقى بعيدًا عن الأقماع؛ العرض الظاهر الآن {sch.plan.width.toFixed(1)}.</p>
        <label htmlFor="tg-spacing">التباعد بين الأقماع: ×{c.spacing.toFixed(2)}</label>
        <input id="tg-spacing" data-testid="tg-spacing" type="range" min={LIMITS.spacing[0]} max={LIMITS.spacing[1]} step="0.05" value={c.spacing} disabled={!structural} onChange={(e) => cfg({ spacing: Number(e.target.value) })} />
        <label>عدد النجوم على الطريق</label>
        <div className={styles.seg} role="group" aria-label="عدد النجوم">
          {([[0, 'أقل'], [1, 'عادي'], [2, 'أكثر']] as const).map(([v, l]) => <button key={v} type="button" data-testid={`tg-density-${v}`} className={`${styles.segBtn} ${c.density === v ? styles.segOn : ''}`} disabled={!structural} aria-pressed={c.density === v} onClick={() => cfg({ density: v })}>{l}</button>)}
        </div>
        <div className={styles.actions} style={{ marginTop: 8 }}>
          <button type="button" className={`${styles.btn} ${styles.btnSm}`} data-testid="tg-reset-manual" disabled={!structural || manual === 0} onClick={() => cfg({ cones: {}, cpPos: {}, start: null, finish: null })}>إلغاء تعديلاتي اليدوية ({manual})</button>
          <button type="button" className={`${styles.btn} ${styles.btnSm}`} data-testid="tg-width-auto" disabled={!editable || c.width === null} onClick={() => cfg({ width: null })}>عرض تلقائي</button>
        </div>
        <label className={styles.check}><input type="checkbox" data-testid="tg-cone-style" checked={c.coneStyle === 'ring'} disabled={!editable} onChange={(e) => cfg({ coneStyle: e.target.checked ? 'ring' : 'cone' })} /> أعلّم مكان المخروط بحلقة فقط (لا أعرض صورة مخروط فوق المخروط الحقيقي)</label>
        {sch.plan.warnings.length > 0 && <ul className={styles.warnList} data-testid="tg-warnings">{sch.plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      </details>

      <details open>
        <summary>التوقف والأحداث</summary>
        <label className={styles.check}><input type="checkbox" data-testid="tg-stops" checked={c.stops} disabled={!editable} onChange={(e) => cfg({ stops: e.target.checked })} /> علامات التوقف (قف ثم تابع)</label>
        <ControlSlot slot="settings"><label htmlFor="tg-stopms">مدة التوقف: {c.stopMs / 1000} ثانية</label>
        <input id="tg-stopms" data-testid="tg-stopms" type="range" min={LIMITS.stopMs[0]} max={LIMITS.stopMs[1]} step="500" value={c.stopMs} disabled={!editable} onChange={(e) => cfg({ stopMs: Number(e.target.value) })} /></ControlSlot>
        <p className={styles.note}>الوقفات القصيرة الاختيارية في «الحديقة المضيئة» لا تتجاوز ٢ ثانية. التوقف يُحسب بساعة اللعب؛ والمعالج هو من يلاحظ ثبات الطفل.</p>
        <label className={styles.check}><input type="checkbox" data-testid="tg-events" checked={c.events} disabled={!editable} onChange={(e) => cfg({ events: e.target.checked })} /> أحداث المسار الديناميكية</label>
        <ControlSlot slot="settings"><label htmlFor="tg-eventms">مدة الانتظار عند الحدث</label>
        <select id="tg-eventms" data-testid="tg-eventms" value={c.eventMs} disabled={!editable} onChange={(e) => cfg({ eventMs: Number(e.target.value) })}>
          {[2000, 3000, 3500, 5000, 8000].map((n) => <option key={n} value={n}>{n / 1000} ثانية</option>)}
        </select></ControlSlot>
        <p className={styles.note}>الأحداث تبدأ فقط بعد تأكيدك نجمة، والطفل واقف عندها؛ ولا يتغيّر الطريق أثناء مشيه. يمكنك إيقافها كلها هنا في أي وقت.</p>
      </details>

      <details>
        <summary>ملف الإسقاط المشترك</summary>
        <label htmlFor="tg-profile">ملف أرضي محفوظ على هذا الجهاز</label>
        <select id="tg-profile" data-testid="tg-profile" value={c.proj.name ?? ''} disabled={!structural} onChange={(e) => { const p = profiles.find((x) => x.name === e.target.value); cfg({ proj: p ? configFromProfile(p) : { name: null, rot: 0, inset: 6, wCm: null, hCm: null } }); }}>
          <option value="">بدون ملف (حدود أمان ٦٪)</option>
          {profiles.map((p) => <option key={p.id} value={p.name}>{p.name} · {p.rotation}°</option>)}
        </select>
        <p className={styles.note}>
          {c.proj.name ? `مُطبَّق: ${c.proj.name} · دوران ${c.proj.rot}° · حدود أمان ${c.proj.inset}٪${cm ? ` · الوحدة ≈ ${Math.round(cm)} سم` : ' · بلا قياس فعلي'}.` : 'الملفات تُنشأ في شاشة «معايرة الإسقاط» على المنصة المتكاملة.'}
          {' '}الملف إعداد تخطيط برمجي فقط: لا يثبت أن الصورة تطابق الأقماع الحقيقية؛ طابق المعاينة بالعين ثم عدّل المواضع.
        </p>
      </details>

      <details>
        <summary>حساسات القدم (اختيارية)</summary>
        <ControlSlot slot="settings"><label htmlFor="tg-input-mode">وضع الإدخال</label>
        <select id="tg-input-mode" data-testid="tg-input-mode" value={c.inputMode} disabled={!editable} onChange={(e) => cfg({ inputMode: e.target.value as Config['inputMode'] })}>
          <option value="MANUAL">يدوي بالكامل</option>
          <option value="RIGHT_FOOT">القدم اليمنى</option>
          <option value="LEFT_FOOT">القدم اليسرى</option>
          <option value="DUAL_FOOT">القدمان</option>
        </select></ControlSlot>
        <label htmlFor="tg-input-source">مصدر الحساسات</label>
        <select id="tg-input-source" data-testid="tg-input-source" value={c.inputSource} disabled={!editable || c.inputMode === 'MANUAL'} onChange={(e) => cfg({ inputSource: e.target.value as Config['inputSource'] })}>
          <option value="manual">بدون حساسات</option>
          <option value="simulated">محاكاة للاختبار فقط</option>
        </select>
        <p className={styles.note}>حساس WT901 على القدم لا يُعطي موقع الطفل على الأرض ولا قربه من مخروط ولا لمسه له. أقصى ما يقدّمه تلميح «تحرّكت القدم» أثناء وقفة أو انتظار، ولا يجمع نجمة ولا يُنهي وقفة. لم يُختبر أي حساس حقيقي مع هذه اللعبة.</p>
        {roles.length > 0 && (
          <div className={styles.sim} data-testid="tg-sim">
            {roles.map((r) => (
              <div key={r} style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 14 }}>{ROLE_NAME[r]} (محاكاة) · {s.sensor.link[r] === 'ok' ? 'متصل' : s.sensor.link[r] === 'lost' ? 'انقطع' : 'بلا بيانات'}</strong>
                <label className={styles.check}><input type="checkbox" data-testid={`tg-sim-move-${r}`} checked={sim.moving[r]} onChange={(e) => setSim({ moving: { ...sim.moving, [r]: e.target.checked } })} /> القدم تتحرك</label>
                <label className={styles.check}><input type="checkbox" data-testid={`tg-sim-link-${r}`} checked={sim.connected[r]} onChange={(e) => setSim({ connected: { ...sim.connected, [r]: e.target.checked } })} /> الحساس متصل</label>
              </div>
            ))}
            <p className={styles.note}>حركات مرصودة: {s.sensor.movements}</p>
          </div>
        )}
      </details>

      <details>
        <summary>الصوت والعرض</summary>
        <label className={styles.check}><input type="checkbox" data-testid="tg-sound" checked={c.sound} disabled={!editable} onChange={(e) => cfg({ sound: e.target.checked })} /> المؤثرات الصوتية</label>
        <label className={styles.check}><input type="checkbox" data-testid="tg-music" checked={c.music} disabled={!editable} onChange={(e) => cfg({ music: e.target.checked })} /> موسيقى هادئة</label>
        <label className={styles.check}><input type="checkbox" data-testid="tg-voice" checked={c.voice} disabled={!editable} onChange={(e) => cfg({ voice: e.target.checked })} /> التوجيه الصوتي المنطوق (قليل)</label>
        <label htmlFor="tg-volume">مستوى الصوت: {Math.round(c.volume * 100)}٪</label>
        <input id="tg-volume" data-testid="tg-volume" type="range" min="0" max="1" step="0.05" value={c.volume} disabled={!editable} onChange={(e) => cfg({ volume: Number(e.target.value) })} />
        <label className={styles.check}><input type="checkbox" data-testid="tg-reduced-motion" checked={c.reducedMotion} disabled={!editable} onChange={(e) => cfg({ reducedMotion: e.target.checked })} /> حركة أقل (أسهم ثابتة، بلا اهتزاز)</label>
        <label className={styles.check}><input type="checkbox" data-testid="tg-reduced-effects" checked={c.reducedEffects} disabled={!editable} onChange={(e) => cfg({ reducedEffects: e.target.checked })} /> مؤثرات بصرية أقل (بلا ظلال وبجسيمات أقل)</label>
        <label className={styles.check}><input type="checkbox" data-testid="tg-contrast" checked={c.highContrast} disabled={!editable} onChange={(e) => cfg({ highContrast: e.target.checked })} /> تباين عالٍ</label>
        <label className={styles.check}><input type="checkbox" data-testid="tg-minimal-hud" checked={c.minimalHud} disabled={!editable} onChange={(e) => cfg({ minimalHud: e.target.checked })} /> واجهة مختصرة (النجوم والإشارة فقط)</label>
        <label htmlFor="tg-quality">جودة الرسم</label>
        <select id="tg-quality" data-testid="tg-quality" value={c.quality} disabled={!editable} onChange={(e) => cfg({ quality: e.target.value as Config['quality'] })}>
          <option value="high">عالية</option>
          <option value="balanced">متوازنة</option>
          <option value="low">منخفضة (جهاز ضعيف)</option>
        </select>
      </details>
    </aside>
  );
}
