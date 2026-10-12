'use client';
import { useState } from 'react';
import { aspectOf, layoutOf, type Command, type State } from '@/lib/safehexarena3d/engine';
import { ASPECT_PRESETS, fitFor, physicalEstimate, type AspectPreset } from '@/lib/safehexarena3d/geometry';
import { LAYOUT_PRESETS, tilesFor, type LayoutPreset } from '@/lib/safehexarena3d/stages';
import styles from './control.module.css';

const PRESET_LABEL: Record<LayoutPreset, string> = {
  STANDARD: 'قياسي · ٩ / ١٢ / ١٦ بلاطة',
  EXTRA_LARGE: 'كبير جدًا · ٦ / ٩ / ١٢ بلاطة (تكييف لسهولة الوصول)',
  COMPACT: 'مضغوط · ١٢ / ١٦ / ٢٠ بلاطة',
};
const nf = (n: number, d = 0) => n.toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d, minimumFractionDigits: d });

/**
 * Layout preset and physical calibration. The therapist enters the projected floor size in centimetres; the panel
 * shows an ESTIMATE of the physical hexagon size and spacing. It is only as good as the numbers entered: the system
 * cannot measure the floor, so it never calls the result verified.
 */
export function CalibrationPanel({ s, send }: { s: State; send: (c: Command) => void }) {
  const [w, setW] = useState(s.config.floorWidthCm ? String(s.config.floorWidthCm) : '');
  const [h, setH] = useState(s.config.floorHeightCm ? String(s.config.floorHeightCm) : '');
  const layout = layoutOf(s);
  const aspect = aspectOf(s.config);
  const fit = fitFor(layout, { aspect, margin: s.config.margin, scale: s.config.scale });
  const est = physicalEstimate(layout, fit, s.config);
  const open = s.status === 'ready' || s.status === 'stage-complete';
  const hasCm = s.config.floorWidthCm > 0 && s.config.floorHeightCm > 0;
  const cfg = (config: Partial<State['config']>) => send({ type: 'configure', config });
  const wn = Number(w);
  const hn = Number(h);
  const valid = Number.isFinite(wn) && Number.isFinite(hn) && wn >= 50 && hn >= 50;
  return (
    <section data-testid="calibration" className={styles.sim} style={{ gap: 10 }}>
      <h2>حجم البلاطات والمعايرة</h2>
      <div>
        <label htmlFor="layoutPreset">حجم مناطق الهدف</label>
        <select id="layoutPreset" value={s.config.layoutPreset} disabled={!open} onChange={(e) => cfg({ layoutPreset: e.target.value as LayoutPreset })}>
          {LAYOUT_PRESETS.map((p) => <option key={p} value={p}>{PRESET_LABEL[p]}</option>)}
        </select>
        {!open && <p className={styles.note}>يمكن تغيير الحجم والأبعاد قبل بدء المرحلة أو بعد إكمالها فقط، حتى لا تتغير هوية البلاطات أثناء الجولة.</p>}
        {s.config.layoutPreset === 'EXTRA_LARGE' && <p className={styles.note}>تكييف لسهولة الوصول: عدد أقل من البلاطات الأكبر. تبقى قواعد المراحل وعدد الجولات كما هي.</p>}
        <p className={styles.note}>هذه المرحلة: {tilesFor(s.stage, s.config.layoutPreset)} بلاطة، بترتيب {layout.rows.join(' + ')}.</p>
      </div>
      <div>
        <label htmlFor="aspect">نسبة صورة جهاز العرض</label>
        <select id="aspect" value={s.config.aspect} disabled={!open} onChange={(e) => cfg({ aspect: e.target.value as AspectPreset })}>
          {(Object.keys(ASPECT_PRESETS) as AspectPreset[]).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <p className={styles.note}>تُرتَّب البلاطات لتناسب هذه النسبة ({nf(aspect, 2)}:1) بأكبر حجم ممكن.</p>
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
        <div>تغطية الساحة للمساحة القابلة للاستخدام: <strong>{nf(fit.usableCoverage * 100)}٪</strong> (عرضًا {nf(fit.widthFill * 100)}٪ · ارتفاعًا {nf(fit.heightFill * 100)}٪ من الشاشة)</div>
        {est ? (
          <>
            <div>عرض السداسي التقديري (ضلع لضلع): <strong>≈ {nf(est.tileFlatToFlatCm)} سم</strong> · من رأس لرأس ≈ {nf(est.tilePointToPointCm)} سم</div>
            <div>الفاصل الآمن التقديري بين البلاطات: <strong>≈ {nf(est.gapCm, 1)} سم</strong></div>
            <div>مقاس الساحة التقديري: ≈ {nf(est.arenaWidthCm)} × {nf(est.arenaHeightCm)} سم</div>
            {est.axisMismatchPct > 3 && <div className={styles.banner}>نسبة الأرضية المُدخلة لا تطابق نسبة صورة جهاز العرض (فرق ≈ {nf(est.axisMismatchPct)}٪): ستبدو البلاطات ممطوطة على الأرض. اضبط وضع الإسقاط أو نسبة الصورة.</div>}
            <p className={styles.note} data-testid="calibration-status">
              {s.config.calibrationConfirmed
                ? 'أقرّ المعالج بقياس الإسقاط ومعايرته. هذه أرقام تقديرية من القيم المُدخلة، ولا يتحقق النظام من دقتها.'
                : 'تقدير من الأرقام المُدخلة فقط. الأبعاد الفعلية غير متحقَّق منها حتى يُقاس الإسقاط ويُعاير على الأرض.'}
            </p>
          </>
        ) : (
          <p className={styles.note} data-testid="calibration-status">أدخل عرض الأرضية وارتفاعها بالسنتيمتر لعرض الحجم الفعلي التقديري للبلاطات. حتى ذلك الحين لا تُعرض أي أبعاد فعلية.</p>
        )}
      </div>
    </section>
  );
}
