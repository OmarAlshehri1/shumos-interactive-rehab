'use client';
import { useState } from 'react';
import { ASPECTS, layoutOf, type Aspect, type Command, type State } from '@/lib/colorchase3d/engine';
import { physicalEstimate } from '@/lib/colorchase3d/layout';
import styles from './control.module.css';

const nf = (n: number, d = 0) => n.toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d, minimumFractionDigits: d });

/**
 * Physical calibration. The therapist enters the projected floor size in centimetres; the panel shows an ESTIMATE of
 * the zone size and distances. It is only as good as the numbers entered: the system cannot measure the floor, so it
 * never calls the result verified.
 */
export function CalibrationPanel({ s, send }: { s: State; send: (c: Command) => void }) {
  const [w, setW] = useState(s.config.floorWidthCm ? String(s.config.floorWidthCm) : '');
  const [h, setH] = useState(s.config.floorHeightCm ? String(s.config.floorHeightCm) : '');
  const layout = layoutOf(s);
  const est = physicalEstimate(layout, s.config.floorWidthCm, s.config.floorHeightCm);
  const open = s.status !== 'running';
  const hasCm = s.config.floorWidthCm > 0 && s.config.floorHeightCm > 0;
  const cfg = (config: Partial<State['config']>) => send({ type: 'configure', config });
  const wn = Number(w), hn = Number(h);
  const valid = Number.isFinite(wn) && Number.isFinite(hn) && wn >= 50 && hn >= 50;
  return (
    <section data-testid="calibration" className={styles.sim} style={{ gap: 10 }}>
      <h2>معايرة الأرضية وحجم المناطق</h2>
      <div>
        <label htmlFor="aspect">نسبة صورة جهاز العرض</label>
        <select id="aspect" value={s.config.aspect} disabled={!open} onChange={(e) => cfg({ aspect: e.target.value as Aspect })}>
          {(Object.keys(ASPECTS) as Aspect[]).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {!open && <p className={styles.note}>تُغيَّر الأبعاد والمناطق والمسافات حين يكون اللعب متوقفًا مؤقتًا أو بين المراحل، فلا تتحرك المناطق أثناء هدف جارٍ.</p>}
      </div>
      <div>
        <label htmlFor="floorW">عرض الأرضية المُسقَطة (سم)</label>
        <input id="floorW" type="number" inputMode="numeric" min="50" max="3000" value={w} disabled={!open} onChange={(e) => setW(e.target.value)} style={{ width: '100%', minHeight: 44, fontSize: 16 }} />
        <label htmlFor="floorH" style={{ marginTop: 8 }}>ارتفاع الأرضية المُسقَطة (سم)</label>
        <input id="floorH" type="number" inputMode="numeric" min="50" max="3000" value={h} disabled={!open} onChange={(e) => setH(e.target.value)} style={{ width: '100%', minHeight: 44, fontSize: 16 }} />
        <div className={styles.actions} style={{ marginTop: 8 }}>
          <button className={`${styles.btn} ${styles.primary}`} style={{ minHeight: 48 }} data-testid="apply-floor" disabled={!open || !valid} onClick={() => cfg({ floorWidthCm: wn, floorHeightCm: hn })}>تطبيق الأبعاد</button>
          <button className={styles.btn} style={{ minHeight: 48 }} disabled={!open || !hasCm} onClick={() => { setW(''); setH(''); cfg({ floorWidthCm: 0, floorHeightCm: 0, calibrationConfirmed: false }); }}>مسح</button>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={s.config.calibrationConfirmed} disabled={!hasCm} onChange={(e) => cfg({ calibrationConfirmed: e.target.checked })} />
          قِستُ الإسقاط وعايرته بنفسي
        </label>
      </div>
      <div className={styles.status} data-testid="calibration-readout" role="status">
        <div>مناطق هذه المرحلة: <strong>{layout.slots.length}</strong> · أبعد مسافة بين منطقتين: {nf((layout.maxDistance / layout.worldH) * 100)}٪ من ارتفاع الأرضية</div>
        {est ? (
          <>
            <div>قطر المنطقة التقديري: <strong>≈ {nf(est.zoneDiameterCm)} سم</strong></div>
            <div>أبعد مسافة بين مركزي منطقتين: <strong>≈ {nf(est.maxDistanceCm)} سم</strong> · أصغر فاصل بين المناطق ≈ {nf(est.minGapCm)} سم</div>
            <div>مقاس المناطق التقديري: ≈ {nf(est.spanWidthCm)} × {nf(est.spanHeightCm)} سم</div>
            {est.axisMismatchPct > 3 && <div className={styles.banner}>نسبة الأرضية المُدخلة لا تطابق نسبة صورة جهاز العرض (فرق ≈ {nf(est.axisMismatchPct)}٪): ستبدو المناطق ممطوطة على الأرض. اضبط وضع الإسقاط أو نسبة الصورة.</div>}
            <p className={styles.note} data-testid="calibration-status">
              {s.config.calibrationConfirmed
                ? 'أقرّ المعالج بقياس الإسقاط ومعايرته. هذه أرقام تقديرية من القيم المُدخلة، ولا يتحقق النظام من دقتها.'
                : 'تقدير من الأرقام المُدخلة فقط. الأبعاد الفعلية غير متحقَّق منها حتى يُقاس الإسقاط ويُعاير على الأرض.'}
            </p>
          </>
        ) : (
          <p className={styles.note} data-testid="calibration-status">أدخل عرض الأرضية وارتفاعها بالسنتيمتر لعرض الحجم الفعلي التقديري للمناطق. حتى ذلك الحين لا تُعرض أي أبعاد فعلية.</p>
        )}
      </div>
    </section>
  );
}
