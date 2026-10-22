'use client';
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { useEffect, useState } from 'react';
import { LIMITS, type Config } from '@/lib/footmaze3d/config';
import { worldOf, type Command, type State } from '@/lib/footmaze3d/engine';
import { cmPerUnit, configFromProfile, loadFloorProfiles, type ProjectionProfileLike } from '@/lib/footmaze3d/projectionProfile';
import { STAGES } from '@/lib/footmaze3d/stages';
import { rolesForMode, type FootRole } from '@/lib/safehexarena3d/sensorInput';
import type { SimState } from '@/lib/footmaze3d/useSession';
import styles from './control.module.css';

const ROLE_NAME: Record<FootRole, string> = { RIGHT_FOOT: 'القدم اليمنى', LEFT_FOOT: 'القدم اليسرى' };
const HINT_LABEL = { auto: 'حسب المرحلة', always: 'أسهم على كل الطريق', next: 'سهم المقطع التالي فقط', none: 'بدون أسهم (تلميح عند الطلب)' } as const;

interface Props { s: State; send: (c: Command) => void; sim: SimState; setSim: (p: Partial<SimState>) => void }

/** Every therapist setting. Settings that change the maze are locked once a stage is running: the maze never moves under a walking child. */
export function Settings({ s, send, sim, setSim }: Props) {
  const c = s.config;
  const w = worldOf(s);
  const editable = s.status !== 'ended';
  const structural = s.status === 'ready';
  const cfg = (config: Partial<Config>) => send({ type: 'configure', config });
  const [profiles, setProfiles] = useState<ProjectionProfileLike[]>([]);
  useEffect(() => { queueMicrotask(() => setProfiles(loadFloorProfiles())); }, []);
  const roles = c.inputSource === 'simulated' ? rolesForMode(c.inputMode) : [];
  const stage = STAGES[s.stage];
  const cm = cmPerUnit(c.proj);
  const defaultWidth = c.simple ? Math.min(LIMITS.width[1], Math.round((stage.width + 0.4) * 10) / 10) : stage.width;

  return (
    <aside className={`${styles.card} ${styles.panel}`} data-testid="fm-settings">
      <h2 style={{ margin: 0, fontSize: 18 }}>إعدادات الجلسة</h2>
      {!structural && <p className={styles.note}>خيارات شكل المتاهة تُقفل بعد بدء المرحلة كي لا يتغيّر الطريق أمام طفل يمشي. أعد ضبط المرحلة لتعديلها.</p>}

      <details open>
        <summary>المتاهة والمسار</summary>
        <label className={styles.check}><input type="checkbox" data-testid="fm-simple" checked={c.simple} disabled={!structural} onChange={(e) => cfg({ simple: e.target.checked })} /> مسار مبسّط (ممر رئيسي واحد، بلا مفترقات ولا طرق مسدودة)</label>
        <p className={styles.note}>المتاهة الحالية: {w.maze.nodes.length} محطة · {w.maze.edges.length} ممرًا · {w.maze.nodes.filter((n) => n.deg >= 3).length} مفترقات · {w.maze.stars.length} نجوم{c.simple ? ' (مبسّطة)' : ''}.</p>
        <label>اتجاه المتاهة على الأرض</label>
        <div className={styles.seg} role="group" aria-label="اتجاه المتاهة">
          {([[0, 'البداية على اليسار'], [180, 'مقلوبة ١٨٠°']] as const).map(([v, l]) => <button key={v} type="button" data-testid={`fm-rot-${v}`} className={`${styles.segBtn} ${c.rot === v ? styles.segOn : ''}`} disabled={!structural} aria-pressed={c.rot === v} onClick={() => cfg({ rot: v })}>{l}</button>)}
        </div>
        <label className={styles.check}><input type="checkbox" data-testid="fm-mirror" checked={c.mirror} disabled={!structural} onChange={(e) => cfg({ mirror: e.target.checked })} /> اقلب المتاهة (يمين ⇄ يسار)</label>
        <p className={styles.note}>اليمين واليسار في التوجيه يُحسبان بالنسبة لجسم الطفل عند سيره، لا بالنسبة للشاشة، فلا يتغيّر المعنى عند القلب أو التدوير.</p>
        <label htmlFor="fm-width">عرض الممر: {w.width.toFixed(1)} وحدة {c.width === null ? '(الافتراضي)' : ''}</label>
        <input id="fm-width" data-testid="fm-width" type="range" min={LIMITS.width[0]} max={LIMITS.width[1]} step="0.1" value={c.width ?? defaultWidth} disabled={!structural} onChange={(e) => cfg({ width: Number(e.target.value) })} />
        <div className={styles.actions} style={{ marginTop: 8 }}>
          <button type="button" className={`${styles.btn} ${styles.btnSm}`} data-testid="fm-width-auto" disabled={!structural || c.width === null} onClick={() => cfg({ width: null })}>عرض تلقائي</button>
          {c.width !== null && c.width < LIMITS.width[0] + 0.01 && <span className={styles.note}>أضيق عرض مسموح</span>}
        </div>
        <p className={styles.note}>اللعبة لا تُضيّق الممر أبدًا دون قرارك: عرضك المعتمد يُحترم كما هو، وتظهر هنا تحذيرات إن اقتربت الممرات من بعضها. وحدات التخطيط ليست سنتيمترات.</p>
        {w.layout.warnings.length > 0 && <ul className={styles.warnList} data-testid="fm-warnings">{w.layout.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        <ControlSlot slot="settings"><label htmlFor="fm-hint">إرشاد الطريق على الأرض</label>
        <select id="fm-hint" data-testid="fm-hint" value={c.hint} disabled={!editable} onChange={(e) => cfg({ hint: e.target.value as Config['hint'] })}>
          {(Object.keys(HINT_LABEL) as (keyof typeof HINT_LABEL)[]).map((k) => <option key={k} value={k}>{HINT_LABEL[k]}{k === 'auto' ? ` · ${HINT_LABEL[stage.hint]}` : ''}</option>)}
        </select></ControlSlot>
        <p className={styles.note}>مع «بدون أسهم» يبقى زر «تلميح» يُظهر الطريق لمدة ٧ ثوانٍ.</p>
      </details>

      <details open>
        <summary>الحارس والانتظار</summary>
        <label className={styles.check}><input type="checkbox" data-testid="fm-guards" checked={c.guards} disabled={!editable} onChange={(e) => cfg({ guards: e.target.checked })} /> الحرّاس الودودون (قف وانتظر ثم تابع)</label>
        <ControlSlot slot="settings"><label htmlFor="fm-guardms">مدة انتظار الحارس: {c.guardMs / 1000} ثانية</label>
        <input id="fm-guardms" data-testid="fm-guardms" type="range" min={LIMITS.guardMs[0]} max={LIMITS.guardMs[1]} step="500" value={c.guardMs} disabled={!editable} onChange={(e) => cfg({ guardMs: Number(e.target.value) })} /></ControlSlot>
        <label className={styles.check}><input type="checkbox" data-testid="fm-stance" checked={c.stance} disabled={!editable} onChange={(e) => cfg({ stance: e.target.checked })} /> وقفة ثبات معتمدة من الأخصائي أثناء الانتظار (تظهر إشارة «قف بثبات»)</label>
        <label className={styles.check}><input type="checkbox" data-testid="fm-events" checked={c.events} disabled={!editable} onChange={(e) => cfg({ events: e.target.checked })} /> الأحداث الديناميكية (بوابات وجسور وتغيّر الطريق)</label>
        <label htmlFor="fm-eventms">مدة انتظار الحدث</label>
        <select id="fm-eventms" data-testid="fm-eventms" value={c.eventMs} disabled={!editable} onChange={(e) => cfg({ eventMs: Number(e.target.value) })}>
          {[2000, 3000, 3500, 5000, 8000].map((n) => <option key={n} value={n}>{n / 1000} ثانية</option>)}
        </select>
        <p className={styles.note}>الحارس والبوابة والجسر وتغيّر الطريق لا تبدأ إلا بعد تأكيدك وصول الطفل إلى منطقة الانتظار (وهو واقف)، ولا يتغيّر الطريق أثناء مشيه. الإيقاف المؤقت يجمّد الانتظار، ويمكنك إنهاءه يدويًا أو تمديده أو إيقاف الحرّاس والأحداث كلها هنا.</p>
      </details>

      <details>
        <summary>ملف الإسقاط المشترك</summary>
        <label htmlFor="fm-profile">ملف أرضي محفوظ على هذا الجهاز</label>
        <select id="fm-profile" data-testid="fm-profile" value={c.proj.name ?? ''} disabled={!structural} onChange={(e) => { const p = profiles.find((x) => x.name === e.target.value); cfg({ proj: p ? configFromProfile(p) : { name: null, rot: 0, inset: 6, wCm: null, hCm: null } }); }}>
          <option value="">بدون ملف (حدود أمان ٦٪)</option>
          {profiles.map((p) => <option key={p.id} value={p.name}>{p.name} · {p.rotation}°</option>)}
        </select>
        <p className={styles.note}>
          {c.proj.name ? `مُطبَّق: ${c.proj.name} · دوران ${c.proj.rot}° · حدود أمان ${c.proj.inset}٪${cm ? ` · الوحدة ≈ ${Math.round(cm)} سم` : ' · بلا قياس فعلي'}.` : 'الملفات تُنشأ في شاشة «معايرة الإسقاط» على المنصة المتكاملة.'}
          {' '}الملف إعداد تخطيط برمجي فقط: لا يثبت أن الصورة تطابق الأقماع الحقيقية؛ طابق المعاينة بالعين على الأرض.
        </p>
      </details>

      <details>
        <summary>حساسات القدم (اختيارية)</summary>
        <ControlSlot slot="settings"><label htmlFor="fm-input-mode">وضع الإدخال</label>
        <select id="fm-input-mode" data-testid="fm-input-mode" value={c.inputMode} disabled={!editable} onChange={(e) => cfg({ inputMode: e.target.value as Config['inputMode'] })}>
          <option value="MANUAL">يدوي بالكامل</option>
          <option value="RIGHT_FOOT">القدم اليمنى</option>
          <option value="LEFT_FOOT">القدم اليسرى</option>
          <option value="DUAL_FOOT">القدمان</option>
        </select></ControlSlot>
        <label htmlFor="fm-input-source">مصدر الحساسات</label>
        <select id="fm-input-source" data-testid="fm-input-source" value={c.inputSource} disabled={!editable || c.inputMode === 'MANUAL'} onChange={(e) => cfg({ inputSource: e.target.value as Config['inputSource'] })}>
          <option value="manual">بدون حساسات</option>
          <option value="simulated">محاكاة للاختبار فقط</option>
        </select>
        <p className={styles.note}>حساس WT901 على القدم لا يُعطي موقع الطفل على الأرض ولا الممر الذي يقف فيه ولا قربه من الحارس. أقصى ما يقدّمه تلميح «تحرّكت القدم» أثناء انتظار الحارس، ولا يجمع نجمة ولا يُنهي انتظار الحارس ولا يحرّك الطفل في المتاهة. لم يُختبر أي حساس حقيقي مع هذه اللعبة.</p>
        {roles.length > 0 && (
          <div className={styles.sim} data-testid="fm-sim">
            {roles.map((r) => (
              <div key={r} style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 14 }}>{ROLE_NAME[r]} (محاكاة) · {s.sensor.link[r] === 'ok' ? 'متصل' : s.sensor.link[r] === 'lost' ? 'انقطع' : 'بلا بيانات'}</strong>
                <label className={styles.check}><input type="checkbox" data-testid={`fm-sim-move-${r}`} checked={sim.moving[r]} onChange={(e) => setSim({ moving: { ...sim.moving, [r]: e.target.checked } })} /> القدم تتحرك</label>
                <label className={styles.check}><input type="checkbox" data-testid={`fm-sim-link-${r}`} checked={sim.connected[r]} onChange={(e) => setSim({ connected: { ...sim.connected, [r]: e.target.checked } })} /> الحساس متصل</label>
              </div>
            ))}
            <p className={styles.note}>حركات مرصودة: {s.sensor.movements}</p>
          </div>
        )}
      </details>

      <details>
        <summary>الصوت والعرض</summary>
        <label className={styles.check}><input type="checkbox" data-testid="fm-sound" checked={c.sound} disabled={!editable} onChange={(e) => cfg({ sound: e.target.checked })} /> المؤثرات الصوتية</label>
        <label className={styles.check}><input type="checkbox" data-testid="fm-music" checked={c.music} disabled={!editable} onChange={(e) => cfg({ music: e.target.checked })} /> موسيقى هادئة</label>
        <label className={styles.check}><input type="checkbox" data-testid="fm-voice" checked={c.voice} disabled={!editable} onChange={(e) => cfg({ voice: e.target.checked })} /> التوجيه الصوتي المنطوق (قليل)</label>
        <label htmlFor="fm-volume">مستوى الصوت: {Math.round(c.volume * 100)}٪</label>
        <input id="fm-volume" data-testid="fm-volume" type="range" min="0" max="1" step="0.05" value={c.volume} disabled={!editable} onChange={(e) => cfg({ volume: Number(e.target.value) })} />
        <label className={styles.check}><input type="checkbox" data-testid="fm-reduced-motion" checked={c.reducedMotion} disabled={!editable} onChange={(e) => cfg({ reducedMotion: e.target.checked })} /> حركة أقل (أسهم ثابتة، بلا اهتزاز)</label>
        <label className={styles.check}><input type="checkbox" data-testid="fm-reduced-effects" checked={c.reducedEffects} disabled={!editable} onChange={(e) => cfg({ reducedEffects: e.target.checked })} /> مؤثرات بصرية أقل (بلا ظلال وبجسيمات أقل)</label>
        <label className={styles.check}><input type="checkbox" data-testid="fm-contrast" checked={c.highContrast} disabled={!editable} onChange={(e) => cfg({ highContrast: e.target.checked })} /> تباين عالٍ</label>
        <label className={styles.check}><input type="checkbox" data-testid="fm-minimal-hud" checked={c.minimalHud} disabled={!editable} onChange={(e) => cfg({ minimalHud: e.target.checked })} /> واجهة مختصرة (النجوم والإشارة فقط)</label>
        <label htmlFor="fm-quality">جودة الرسم</label>
        <select id="fm-quality" data-testid="fm-quality" value={c.quality} disabled={!editable} onChange={(e) => cfg({ quality: e.target.value as Config['quality'] })}>
          <option value="high">عالية</option>
          <option value="balanced">متوازنة</option>
          <option value="low">منخفضة (جهاز ضعيف)</option>
        </select>
      </details>
    </aside>
  );
}
