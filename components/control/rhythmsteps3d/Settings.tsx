'use client';
import { ASPECTS, LANE_SETS, LIMITS, SPEED_PROFILES, activeLanes, speedOf, type Aspect, type Config, type InputMode, type LaneSet, type Limbs, type SpeedProfile } from '@/lib/rhythmsteps3d/config';
import { computeLayout, estimateZoneCm } from '@/lib/rhythmsteps3d/layout';
import { rolesForMode, type FootRole } from '@/lib/safehexarena3d/sensorInput';
import { STAGES } from '@/lib/rhythmsteps3d/stages';
import { played, type Command, type State } from '@/lib/rhythmsteps3d/engine';
import type { SimState } from '@/lib/rhythmsteps3d/useSession';
import styles from './control.module.css';

const ROLE_NAME: Record<FootRole, string> = { RIGHT_FOOT: 'القدم اليمنى', LEFT_FOOT: 'القدم اليسرى' };

interface Props {
  s: State;
  send: (c: Command) => void;
  sim: SimState;
  setSim: (p: Partial<SimState>) => void;
}

/** Every therapist setting. Settings that change the pattern re-plan only targets that are not yet visible (see engine.ts). */
export function Settings({ s, send, sim, setSim }: Props) {
  const c = s.config;
  const editable = s.status !== 'ended';
  const cfg = (config: Partial<Config>) => send({ type: 'configure', config });
  const lanes = activeLanes(c).length;
  const layout = computeLayout(c, 16 / 9);
  const zoneCm = estimateZoneCm(layout, c);
  const roles = c.inputSource === 'simulated' ? rolesForMode(c.inputMode) : [];
  const selectable = s.status === 'ready' || s.status === 'paused' || s.status === 'stage-complete';
  const anchorOptions = Array.from({ length: lanes }, (_, i) => i);

  return (
    <aside className={`${styles.card} ${styles.panel}`} data-testid="rs-settings">
      <h2 style={{ margin: 0, fontSize: 18 }}>إعدادات الجلسة</h2>

      <details open>
        <summary>المرحلة</summary>
        <label htmlFor="rs-stage">المستوى والمرحلة</label>
        <select id="rs-stage" data-testid="rs-stage" value={s.stage} disabled={!selectable} onChange={(e) => send({ type: 'stage', stage: Number(e.target.value) })}>
          {STAGES.map((d, i) => (
            <option key={i} value={i} disabled={i !== s.stage && played(s, i)}>المستوى {d.level} · المرحلة {d.stage} · {d.nameAr}</option>
          ))}
        </select>
        <p className={styles.note}>تغيير المرحلة متاح قبل البدء أو أثناء الإيقاف المؤقت. المراحل التي لُعبت لا تُختار مرة أخرى في الجلسة نفسها.</p>
      </details>

      <details open>
        <summary>التدفق والسرعة</summary>
        <label htmlFor="rs-flow">نمط التدفق</label>
        <select id="rs-flow" data-testid="rs-flow" value={c.flow} disabled={!editable} onChange={(e) => cfg({ flow: e.target.value as Config['flow'] })}>
          <option value="continuous">مستمر · تتابع الأهداف بإيقاعها</option>
          <option value="assisted">مساعد · ينتظر الهدف عند الخط حتى تؤكّد أو تتخطّى</option>
        </select>
        <p className={styles.note}>في التدفق المستمر يُسجَّل الهدف الذي لم يُؤكَّد «غير مؤكد» دون أي عقوبة أو رسالة فشل.</p>
        <label htmlFor="rs-speed">سرعة الأهداف</label>
        <select id="rs-speed" data-testid="rs-speed" value={c.speedProfile} disabled={!editable} onChange={(e) => cfg({ speedProfile: e.target.value as SpeedProfile })}>
          {(Object.keys(SPEED_PROFILES) as SpeedProfile[]).map((k) => <option key={k} value={k}>{SPEED_PROFILES[k].label}{k === 'custom' ? '' : ` · ×${SPEED_PROFILES[k].speed}`}</option>)}
        </select>
        {c.speedProfile === 'custom' && (
          <>
            <label htmlFor="rs-custom">السرعة المخصّصة: ×{c.customSpeed.toFixed(2)}</label>
            <input id="rs-custom" type="range" min={LIMITS.customSpeed[0]} max={LIMITS.customSpeed[1]} step="0.05" value={c.customSpeed} disabled={!editable} onChange={(e) => cfg({ customSpeed: Number(e.target.value) })} />
          </>
        )}
        <p className={styles.note}>السرعة الحالية ×{speedOf(c).toFixed(2)}. تغيير السرعة يبدّل المعدل فقط، فلا يختلّ التزامن.</p>
        <label htmlFor="rs-spacing">التباعد بين الأهداف: ×{c.spacing}</label>
        <input id="rs-spacing" data-testid="rs-spacing" type="range" min={LIMITS.spacing[0]} max={LIMITS.spacing[1]} step="0.25" value={c.spacing} disabled={!editable} onChange={(e) => cfg({ spacing: Number(e.target.value) })} />
        <label htmlFor="rs-grace">مهلة الهدف عند الخط (التدفق المستمر)</label>
        <select id="rs-grace" value={c.graceMs} disabled={!editable} onChange={(e) => cfg({ graceMs: Number(e.target.value) })}>
          {[2000, 3500, 5000, 8000].map((n) => <option key={n} value={n}>{n / 1000} ثانية</option>)}
        </select>
      </details>

      <details>
        <summary>المسارات والأطراف</summary>
        <label htmlFor="rs-lanes">المسارات الفعّالة</label>
        <select id="rs-lanes" data-testid="rs-lanes" value={c.laneSet} disabled={!editable} onChange={(e) => cfg({ laneSet: e.target.value as LaneSet })}>
          {(Object.keys(LANE_SETS) as LaneSet[]).map((k) => <option key={k} value={k}>{LANE_SETS[k].label}</option>)}
        </select>
        <label htmlFor="rs-limbs">الأطراف المشاركة</label>
        <select id="rs-limbs" data-testid="rs-limbs" value={c.limbs} disabled={!editable} onChange={(e) => cfg({ limbs: e.target.value as Limbs })}>
          <option value="both">القدمان</option>
          <option value="right">القدم اليمنى فقط</option>
          <option value="left">القدم اليسرى فقط</option>
        </select>
        <p className={styles.note}>عند اختيار قدم واحدة تتحوّل كل الحركات إلى خطوات بتلك القدم، ولا تُطلب حركة بالقدم الأخرى.</p>
        <label htmlFor="rs-stance">عرض الوقفة بين القدمين</label>
        <select id="rs-stance" data-testid="rs-stance" value={c.stanceWidth} disabled={!editable || lanes < 3} onChange={(e) => cfg({ stanceWidth: Number(e.target.value) as 1 | 2 })}>
          <option value={1}>مساران متجاوران (الأكثر أمانًا)</option>
          <option value={2}>مسار واحد بينهما</option>
        </select>
        <p className={styles.note}>لا تُطلب القدمان على مسارين متباعدين أكثر من هذا الحد، ولا تتقاطع القدمان أبدًا.</p>
        <label className={styles.check}><input type="checkbox" checked={c.sided} disabled={!editable} onChange={(e) => cfg({ sided: e.target.checked })} /> تمييز يمين/يسار في الخطوات المفردة</label>
        <label htmlFor="rs-anchor">مسار القدم الثابتة (المرحلة ٥)</label>
        <select id="rs-anchor" value={c.anchor} disabled={!editable} onChange={(e) => cfg({ anchor: Number(e.target.value) })}>
          {anchorOptions.map((i) => <option key={i} value={i}>المسار {i + 1} من اليسار</option>)}
        </select>
        <div className={styles.note}>أنواع الحركة المسموحة:</div>
        {([['single', 'قدم واحدة'], ['both', 'القدمان معًا على مربع'], ['dual', 'قدم على كل مسار'], ['split', 'قدم تثبت وقدم تتحرك'], ['hold', 'ثبات']] as const).map(([k, label]) => (
          <label key={k} className={styles.check}><input type="checkbox" data-testid={`rs-allow-${k}`} checked={c.allow[k]} disabled={!editable} onChange={(e) => cfg({ allow: { ...c.allow, [k]: e.target.checked } })} /> {label}</label>
        ))}
        <label htmlFor="rs-hold">مدة الثبات</label>
        <select id="rs-hold" data-testid="rs-hold" value={c.holdMs} disabled={!editable || !c.allow.hold} onChange={(e) => cfg({ holdMs: Number(e.target.value) })}>
          {[1000, 2000, 3000, 4000, 5000, 6000, 8000].map((n) => <option key={n} value={n}>{n / 1000} ثانية</option>)}
        </select>
        <p className={styles.note}>المدد أمثلة للواجهة، لا وصفة علاجية: تختار ما يناسب الطفل.</p>
        <label className={styles.check}><input type="checkbox" data-testid="rs-jump" checked={c.jumping} disabled={!editable || c.limbs !== 'both'} onChange={(e) => cfg({ jumping: e.target.checked })} /> تفعيل القفز الاختياري (بموافقة المعالج)</label>
        {c.jumping && <p className={styles.banner}>القفز غير مطلوب في أي مرحلة. لكل قفزة بديل بخطوة بالقدمين، وتأكيد القفز يدوي دائمًا: حركة الحساس لا تُعدّ قفزة مؤكدة.</p>}
        <label className={styles.check}><input type="checkbox" checked={c.fast} disabled={!editable} onChange={(e) => cfg({ fast: e.target.checked })} /> أنماط أسرع قليلًا (المرحلة ٩ فقط)</label>
      </details>

      <details>
        <summary>الصوت</summary>
        <label className={styles.check}><input type="checkbox" data-testid="rs-music" checked={c.music} disabled={!editable} onChange={(e) => cfg({ music: e.target.checked })} /> موسيقى (على نبض ساعة اللعب نفسها)</label>
        <label className={styles.check}><input type="checkbox" checked={c.sfx} disabled={!editable} onChange={(e) => cfg({ sfx: e.target.checked })} /> مؤثرات النجاح والتنبيه</label>
        <label htmlFor="rs-vol">مستوى الصوت: {c.volume}</label>
        <input id="rs-vol" data-testid="rs-volume" type="range" min="0" max="100" step="5" value={c.volume} disabled={!editable} onChange={(e) => cfg({ volume: Number(e.target.value) })} />
        <button type="button" className={styles.btn} style={{ minHeight: 44 }} data-testid="rs-mute" onClick={() => cfg({ volume: c.volume === 0 ? 70 : 0 })} disabled={!editable}>{c.volume === 0 ? 'إلغاء الكتم' : 'كتم الصوت'}</button>
        <p className={styles.note}>اللعبة كاملة بدون صوت، وكل تعليمة مكتوبة ومرئية. يحتاج المتصفح نقرة واحدة على شاشة العرض لتفعيل الصوت.</p>
      </details>

      <details>
        <summary>المرئيات</summary>
        <label htmlFor="rs-int">شدة التوهج: {c.intensity}٪</label>
        <input id="rs-int" data-testid="rs-intensity" type="range" min={LIMITS.intensity[0]} max={LIMITS.intensity[1]} step="5" value={c.intensity} disabled={!editable} onChange={(e) => cfg({ intensity: Number(e.target.value) })} />
        <label className={styles.check}><input type="checkbox" data-testid="rs-reduced" checked={c.reducedEffects} disabled={!editable} onChange={(e) => cfg({ reducedEffects: e.target.checked })} /> تقليل المؤثرات (بلا انفجارات ولا حركة زخرفية كثيفة)</label>
        <label className={styles.check}><input type="checkbox" data-testid="rs-hc" checked={c.highContrast} disabled={!editable} onChange={(e) => cfg({ highContrast: e.target.checked })} /> تباين عالٍ (خلفية بسيطة)</label>
        <label htmlFor="rs-q">جودة العرض</label>
        <select id="rs-q" value={c.quality} disabled={!editable} onChange={(e) => cfg({ quality: e.target.value as Config['quality'] })}>
          <option value="high">عالية</option>
          <option value="low">خفيفة (أداء أفضل)</option>
        </select>
      </details>

      <details data-testid="rs-calibration">
        <summary>معايرة الإسقاط على الأرض</summary>
        <p className={styles.note}>لا يعرف النظام أبعاد الأرض الحقيقية: اضبط الصورة حتى تتطابق المربعات مع المساحة المتاحة. الكاميرا ثابتة، والمربعات القريبة لا تتحرك ولا تتغيّر أثناء اللعب.</p>
        {([
          ['margin', 'هامش آمن', '٪', LIMITS.margin, 1],
          ['targetSize', 'حجم المربعات', '٪', LIMITS.targetSize, 5],
          ['laneSpacing', 'تباعد المسارات', '٪', LIMITS.laneSpacing, 5],
          ['nearY', 'ارتفاع المربعات عن الحافة القريبة', '٪', LIMITS.nearY, 1],
          ['perspective', 'قوة المنظور (٠ = علوي مسطّح)', '', LIMITS.perspective, 2],
        ] as const).map(([k, label, unit, lim, step]) => (
          <div key={k}>
            <label htmlFor={`rs-${k}`}>{label}: {c[k]}{unit}</label>
            <input id={`rs-${k}`} data-testid={`rs-${k}`} type="range" min={lim[0]} max={lim[1]} step={step} value={c[k]} disabled={!editable} onChange={(e) => cfg({ [k]: Number(e.target.value) } as Partial<Config>)} />
          </div>
        ))}
        <label htmlFor="rs-aspect">شكل صورة جهاز العرض</label>
        <select id="rs-aspect" data-testid="rs-aspect" value={c.aspect} disabled={!editable} onChange={(e) => cfg({ aspect: e.target.value as Aspect })}>
          <option value="auto">تلقائي · ملء النافذة</option>
          {(Object.keys(ASPECTS) as Exclude<Aspect, 'auto'>[]).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className={styles.row2}>
          <div>
            <label htmlFor="rs-fw">عرض الصورة على الأرض (سم)</label>
            <input id="rs-fw" type="number" min="0" max="3000" value={c.floorWidthCm || ''} placeholder="لم يُدخل" disabled={!editable} onChange={(e) => cfg({ floorWidthCm: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <label htmlFor="rs-fh">طول الصورة (سم)</label>
            <input id="rs-fh" type="number" min="0" max="3000" value={c.floorHeightCm || ''} placeholder="لم يُدخل" disabled={!editable} onChange={(e) => cfg({ floorHeightCm: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <p className={styles.note} data-testid="rs-cm">
          {zoneCm !== null
            ? `حجم المربع القريب ≈ ${zoneCm} سم (تقدير من القياس الذي أدخلته، بافتراض أن الصورة مسقطة مستوية؛ ليس قياسًا فعليًا).`
            : 'لم تُدخل قياسًا، لذلك لا تُعرض أي مسافات بالسنتيمتر. قِس عرض الصورة على الأرض وأدخله لتظهر التقديرات.'}
        </p>
        {layout.nearYEffective > c.nearY + 0.5 && <p className={styles.note}>رُفعت المربعات إلى {Math.round(layout.nearYEffective)}٪ حتى لا تُقصّ عند الحافة.</p>}
        <label className={styles.check}><input type="checkbox" checked={c.calibrationConfirmed} disabled={!editable} onChange={(e) => cfg({ calibrationConfirmed: e.target.checked })} /> أؤكد أنني قستُ الإسقاط وعايرته (بيان المعالج، لا إثبات دقة)</label>
        <label className={styles.check}><input type="checkbox" data-testid="rs-grid" checked={c.grid} disabled={!editable} onChange={(e) => cfg({ grid: e.target.checked })} /> شبكة المعايرة على الأرض</label>
      </details>

      <details data-testid="rs-sensors">
        <summary>مصدر الحركة والحساسات</summary>
        <label htmlFor="rs-input">وضع الإدخال</label>
        <select
          id="rs-input"
          data-testid="rs-input"
          value={c.inputSource === 'simulated' ? c.inputMode : 'MANUAL'}
          disabled={!editable}
          onChange={(e) => {
            const mode = e.target.value as InputMode;
            cfg({ inputMode: mode, inputSource: mode === 'MANUAL' ? 'manual' : 'simulated' });
          }}
        >
          <option value="MANUAL">يدوي · بدون حساسات</option>
          <option value="RIGHT_FOOT">محاكاة · القدم اليمنى</option>
          <option value="LEFT_FOOT">محاكاة · القدم اليسرى</option>
          <option value="DUAL_FOOT">محاكاة · القدمان</option>
          <option disabled>حساسات فعلية · بانتظار التحقق</option>
        </select>
        {roles.length > 0 && (
          <div className={styles.sim}>
            {roles.map((role) => (
              <div key={role}>
                <strong>{ROLE_NAME[role]}</strong> · {s.sensor.link[role] === 'lost' ? 'الاتصال مفقود' : s.sensor.link[role] === 'ok' ? 'متصلة' : 'بانتظار إشارة'}
                <div className={styles.actions} style={{ marginTop: 6 }}>
                  <button type="button" className={styles.btn} style={{ minHeight: 44 }} aria-pressed={sim.moving[role]} onClick={() => setSim({ moving: { ...sim.moving, [role]: !sim.moving[role] } })}>{sim.moving[role] ? 'أوقف الحركة' : 'حرّك القدم'}</button>
                  <button type="button" className={styles.btn} style={{ minHeight: 44 }} aria-pressed={!sim.connected[role]} onClick={() => setSim({ connected: { ...sim.connected, [role]: !sim.connected[role] } })}>{sim.connected[role] ? 'افصل الحساس' : 'أعد الاتصال'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className={styles.banner} style={{ marginTop: 8 }}>حساسات WT901 قياسات حركة (IMU): لا تُعطي موقع القدم على الأرض ولا تدلّ على أي مربع يقف عليه الطفل، ولا تكشف الضغط أو الوقوف على قدم واحدة أو القفز بصورة موثوقة. لذلك يؤكّد المعالج كل موضع يدويًا دائمًا، والمحاكاة هنا للتجربة فقط. لم يُختبر أي حساس فعلي مع هذه اللعبة.</p>
      </details>
    </aside>
  );
}
