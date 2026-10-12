'use client';
import { useEffect, useState } from 'react';
import { LIMITS, type Config } from '@/lib/bodysequence3d/config';
import type { Command, State } from '@/lib/bodysequence3d/engine';
import { cmPerUnit, configFromProfile, loadFloorProfiles, type ProjectionProfileLike } from '@/lib/bodysequence3d/projectionProfile';
import type { Foot } from '@/lib/bodysequence3d/sequence';
import { rolesForMode, type FootRole } from '@/lib/safehexarena3d/sensorInput';
import type { SimState } from '@/lib/bodysequence3d/useSession';
import styles from './control.module.css';

const ROLE_NAME: Record<FootRole, string> = { RIGHT_FOOT: 'القدم اليمنى', LEFT_FOOT: 'القدم اليسرى' };
const EDGES: { v: 0 | 90 | 180 | 270; label: string }[] = [{ v: 0, label: '↓ السفلية' }, { v: 90, label: '→ اليسرى' }, { v: 180, label: '↑ العليا' }, { v: 270, label: '← اليمنى' }];

interface Props { s: State; send: (c: Command) => void; sim: SimState; setSim: (p: Partial<SimState>) => void }

const toggleLane = (cur: string, lane: 'L' | 'C' | 'R', on: boolean) => (['L', 'C', 'R'] as const).filter((l) => (l === lane ? on : cur.includes(l))).join('');

/** Every therapist setting. Settings that change movements or lane placement are locked once a stage is running. */
export function Settings({ s, send, sim, setSim }: Props) {
  const c = s.config;
  const editable = s.status !== 'ended';
  const structural = s.status === 'ready';
  const cfg = (config: Partial<Config>) => send({ type: 'configure', config });
  const [profiles, setProfiles] = useState<ProjectionProfileLike[]>([]);
  useEffect(() => { queueMicrotask(() => setProfiles(loadFloorProfiles())); }, []);
  const roles = c.inputSource === 'simulated' ? rolesForMode(c.inputMode) : [];
  const cm = cmPerUnit(c.proj);
  const three = s.stage >= 3;

  return (
    <aside className={`${styles.card} ${styles.panel}`} data-testid="bs-settings">
      <h2 style={{ margin: 0, fontSize: 18 }}>إعدادات الجلسة</h2>
      {!structural && <p className={styles.note}>خيارات القدمين والممرّات تُقفل بعد بدء المرحلة كي لا تتغير الحركات المطلوبة أمام طفل يتحرك. أوقف المرحلة أو أعد ضبطها لتعديلها.</p>}

      <details open>
        <summary>القدمان والحركات المسموحة</summary>
        <label>القدم التي تتحرك</label>
        <div className={styles.seg} role="group" aria-label="القدمان المسموحتان">
          {([['both', 'كلتاهما'], ['R', 'اليمنى فقط'], ['L', 'اليسرى فقط']] as const).map(([v, l]) => <button key={v} type="button" data-testid={`bs-feet-${v}`} className={`${styles.segBtn} ${c.feet === v ? styles.segOn : ''}`} disabled={!structural} aria-pressed={c.feet === v} onClick={() => cfg({ feet: v })}>{l}</button>)}
        </div>
        <p className={styles.note}>عند اختيار قدم واحدة تتحرك القدم الأخرى لا تُطلب منها حركة (في «قدم تبقى» تثبت في مكانها). مراحل التبديل تكرر القدم المسموحة.</p>
        <label>الممرّات المسموحة لكل قدم {three ? '' : '(المرحلة الحالية ممرّان فقط؛ الوسط يُستخدم من المرحلة الرابعة)'}</label>
        <div className={styles.matrix} data-testid="bs-allow">
          {(['R', 'L'] as Foot[]).map((f) => (
            <div key={f} style={{ display: 'contents' }}>
              <b>{f === 'R' ? 'اليمنى' : 'اليسرى'}</b>
              {(['L', 'C', 'R'] as const).map((l) => (
                <label key={l} className={styles.check} style={{ margin: 0 }}>
                  <input type="checkbox" data-testid={`bs-allow-${f}-${l}`} checked={c.allow[f].includes(l)} disabled={!structural} onChange={(e) => cfg({ allow: { ...c.allow, [f]: toggleLane(c.allow[f], l, e.target.checked) } })} />
                  {l === 'L' ? 'يسار' : l === 'C' ? 'وسط' : 'يمين'}
                </label>
              ))}
            </div>
          ))}
        </div>
        <p className={styles.note}>الافتراضي بلا تقاطع للساقين: اليمنى إلى الوسط واليمين، واليسرى إلى اليسار والوسط. إن عطّلت كل ممرّات قدم ما يعود التطبيق إلى ممرّها الجانبي الآمن. لا تُجبَر أي حركة غير مسموحة.</p>
      </details>

      <details open>
        <summary>الممرّات والتباعد الآمن</summary>
        <label htmlFor="bs-spacing">حجم الممرّات والتباعد: ×{c.spacing.toFixed(2)}</label>
        <input id="bs-spacing" data-testid="bs-spacing" type="range" min={LIMITS.spacing[0]} max={LIMITS.spacing[1]} step="0.05" value={c.spacing} disabled={!structural} onChange={(e) => cfg({ spacing: Number(e.target.value) })} />
        <p className={styles.note}>صغّر التباعد لطفل يحتاج خطوة قصيرة وكبّره لمساحة أوسع. اضبطه بنظرك على الأرض؛ الوحدات تخطيطية وليست سنتيمترات، ولا يفترض التطبيق أن البكسل يساوي مسافة حقيقية.</p>
        <label>الحافة التي يقف عندها الطفل في الصورة المعروضة</label>
        <div className={styles.seg} role="group" aria-label="موضع الطفل">
          {EDGES.map((r) => <button key={r.v} type="button" data-testid={`bs-rot-${r.v}`} className={`${styles.segBtn} ${c.rot === r.v ? styles.segOn : ''}`} disabled={!structural} aria-pressed={c.rot === r.v} onClick={() => cfg({ rot: r.v })}>{r.label}</button>)}
        </div>
        <label className={styles.check}><input type="checkbox" data-testid="bs-mirror" checked={c.mirror} disabled={!structural} onChange={(e) => cfg({ mirror: e.target.checked })} /> بدّل مكان اليمين واليسار على الشاشة</label>
        <p className={styles.note}>الإعداد الافتراضي: الطفل عند الحافة السفلية ينظر إلى أعلى الصورة، فتكون يمينه على يمين الشاشة. الأشكال والأسهم ترسَم دائمًا من جهة الطفل ولا تُعكس. تحقّق بنفسك أن الممرّ الأيمن المضيء أمام يمين الطفل فعلًا.</p>
      </details>

      <details open>
        <summary>الثبات والتلميحات</summary>
        <label className={styles.check}><input type="checkbox" data-testid="bs-holds" checked={c.holds} disabled={!structural} onChange={(e) => cfg({ holds: e.target.checked })} /> وقفات الثبات (قدم تثبت، توقّف)</label>
        <label htmlFor="bs-holdms">مدة الوقفة: {c.holdMs / 1000} ثانية</label>
        <input id="bs-holdms" data-testid="bs-holdms" type="range" min={LIMITS.holdMs[0]} max={LIMITS.holdMs[1]} step="500" value={c.holdMs} disabled={!structural || !c.holds} onChange={(e) => cfg({ holdMs: Number(e.target.value) })} />
        <p className={styles.note}>إن أوقفت الوقفات تكتمل حركة «اثبت» و«توقّف» بتأكيدك مباشرة. الوقفة تُحسب بساعة اللعب والمعالج هو من يلاحظ ثبات الطفل.</p>
        <label className={styles.check}><input type="checkbox" data-testid="bs-hints" checked={c.hints} disabled={!editable} onChange={(e) => cfg({ hints: e.target.checked })} /> تلميحات: أظهر الحركة التالية أثناء التذكّر</label>
      </details>

      <details>
        <summary>ملف الإسقاط المشترك</summary>
        <label htmlFor="bs-profile">ملف أرضي محفوظ على هذا الجهاز</label>
        <select id="bs-profile" data-testid="bs-profile" value={c.proj.name ?? ''} disabled={!structural} onChange={(e) => { const p = profiles.find((x) => x.name === e.target.value); cfg({ proj: p ? configFromProfile(p) : { name: null, rot: 0, inset: 6, wCm: null, hCm: null } }); }}>
          <option value="">بدون ملف (حدود أمان ٦٪)</option>
          {profiles.map((p) => <option key={p.id} value={p.name}>{p.name} · {p.rotation}°</option>)}
        </select>
        <p className={styles.note}>
          {c.proj.name ? `مُطبَّق: ${c.proj.name} · دوران ${c.proj.rot}° · حدود أمان ${c.proj.inset}٪${cm ? ` · الوحدة ≈ ${Math.round(cm)} سم` : ' · بلا قياس فعلي'}.` : 'الملفات تُنشأ في شاشة «معايرة الإسقاط» على المنصة المتكاملة.'}
          {' '}الملف إعداد تخطيط برمجي فقط: لا يثبت أن الصورة تطابق الأرض الحقيقية؛ طابق الممرّات بالعين ثم عدّل التباعد.
        </p>
      </details>

      <details>
        <summary>حساسات القدم (اختيارية)</summary>
        <label htmlFor="bs-input-mode">وضع الإدخال</label>
        <select id="bs-input-mode" data-testid="bs-input-mode" value={c.inputMode} disabled={!editable} onChange={(e) => cfg({ inputMode: e.target.value as Config['inputMode'] })}>
          <option value="MANUAL">يدوي بالكامل</option>
          <option value="RIGHT_FOOT">القدم اليمنى</option>
          <option value="LEFT_FOOT">القدم اليسرى</option>
          <option value="DUAL_FOOT">القدمان</option>
        </select>
        <label htmlFor="bs-input-source">مصدر الحساسات</label>
        <select id="bs-input-source" data-testid="bs-input-source" value={c.inputSource} disabled={!editable || c.inputMode === 'MANUAL'} onChange={(e) => cfg({ inputSource: e.target.value as Config['inputSource'] })}>
          <option value="manual">بدون حساسات</option>
          <option value="simulated">محاكاة للاختبار فقط</option>
        </select>
        <p className={styles.note}>حساس WT901 على القدم لا يُعطي موقع القدم على الأرض ولا الممرّ الذي تقف فيه، ولا الضغط ولا توزيع الوزن ولا الوقوف على قدم واحدة. أقصى ما يقدّمه تلميح «تحرّكت القدم» أثناء وقفة أو ثبات؛ لا يؤكّد حركة ولا يُنهي وقفة. لم يُختبر أي حساس حقيقي مع هذه اللعبة.</p>
        {roles.length > 0 && (
          <div className={styles.sim} data-testid="bs-sim">
            {roles.map((r) => (
              <div key={r} style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 14 }}>{ROLE_NAME[r]} (محاكاة) · {s.sensor.link[r] === 'ok' ? 'متصل' : s.sensor.link[r] === 'lost' ? 'انقطع' : 'بلا بيانات'}</strong>
                <label className={styles.check}><input type="checkbox" data-testid={`bs-sim-move-${r}`} checked={sim.moving[r]} onChange={(e) => setSim({ moving: { ...sim.moving, [r]: e.target.checked } })} /> القدم تتحرك</label>
                <label className={styles.check}><input type="checkbox" data-testid={`bs-sim-link-${r}`} checked={sim.connected[r]} onChange={(e) => setSim({ connected: { ...sim.connected, [r]: e.target.checked } })} /> الحساس متصل</label>
              </div>
            ))}
            <p className={styles.note}>حركات مرصودة: {s.sensor.movements}</p>
          </div>
        )}
      </details>

      <details>
        <summary>الصوت والعرض</summary>
        <label className={styles.check}><input type="checkbox" data-testid="bs-sound" checked={c.sound} disabled={!editable} onChange={(e) => cfg({ sound: e.target.checked })} /> المؤثرات الصوتية</label>
        <label className={styles.check}><input type="checkbox" data-testid="bs-music" checked={c.music} disabled={!editable} onChange={(e) => cfg({ music: e.target.checked })} /> موسيقى هادئة</label>
        <label className={styles.check}><input type="checkbox" data-testid="bs-voice" checked={c.voice} disabled={!editable} onChange={(e) => cfg({ voice: e.target.checked })} /> التوجيه الصوتي المنطوق (قليل)</label>
        <label htmlFor="bs-volume">مستوى الصوت: {Math.round(c.volume * 100)}٪</label>
        <input id="bs-volume" data-testid="bs-volume" type="range" min="0" max="1" step="0.05" value={c.volume} disabled={!editable} onChange={(e) => cfg({ volume: Number(e.target.value) })} />
        <label className={styles.check}><input type="checkbox" data-testid="bs-reduced-motion" checked={c.reducedMotion} disabled={!editable} onChange={(e) => cfg({ reducedMotion: e.target.checked })} /> حركة أقل (بلا نبض ودوران)</label>
        <label className={styles.check}><input type="checkbox" data-testid="bs-reduced-effects" checked={c.reducedEffects} disabled={!editable} onChange={(e) => cfg({ reducedEffects: e.target.checked })} /> مؤثرات بصرية أقل (بلا ظلال وانعكاسات وبجسيمات أقل)</label>
        <label className={styles.check}><input type="checkbox" data-testid="bs-contrast" checked={c.highContrast} disabled={!editable} onChange={(e) => cfg({ highContrast: e.target.checked })} /> تباين عالٍ</label>
        <label className={styles.check}><input type="checkbox" data-testid="bs-minimal-hud" checked={c.minimalHud} disabled={!editable} onChange={(e) => cfg({ minimalHud: e.target.checked })} /> واجهة مختصرة</label>
        <label htmlFor="bs-quality">جودة الرسم</label>
        <select id="bs-quality" data-testid="bs-quality" value={c.quality} disabled={!editable} onChange={(e) => cfg({ quality: e.target.value as Config['quality'] })}>
          <option value="high">عالية</option>
          <option value="balanced">متوازنة</option>
          <option value="low">منخفضة (جهاز ضعيف)</option>
        </select>
      </details>
    </aside>
  );
}
