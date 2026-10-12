'use client';
import { useEffect, useState } from 'react';
import { type Axis, type Mapping } from '@/lib/firerescue3d/input';
import styles from './control.module.css';
const axes = ['steering', 'throttle', 'brake', 'aimX', 'aimY'] as const;
const labels = { steering: 'المقود', throttle: 'دواسة التسارع', brake: 'دواسة الفرامل', aimX: 'الماء أفقيًا', aimY: 'الماء عموديًا' };
export function DeviceMapping({ mapping, onChange }: {
    mapping: Mapping;
    onChange: (m: Mapping) => void;
}) {
    const [devices, setDevices] = useState<{
        index: number;
        id: string;
        axes: number[];
        buttons: number[];
    }[]>([]);
    useEffect(() => { const timer = setInterval(() => { setDevices(typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p?.connected).map(p => ({ index: p.index, id: p.id, axes: Array.from(p.axes), buttons: p.buttons.map(b => b.value) })) : []); }, 200); return () => clearInterval(timer); }, []);
    const device = devices.find(d => d.index === mapping.deviceIndex);
    const axis = (key: typeof axes[number], patch: Partial<Axis>) => onChange({ ...mapping, [key]: { ...mapping[key], ...patch } });
    return <details className={styles.details}><summary>معايرة المقود والدواسات / Gamepad</summary><p className={styles.note}>وصّل الجهاز بنفس كمبيوتر التحكم واضغط أحد أزراره. اختر المحاور ثم عايرها؛ لا نفترض ترتيبًا أو توافقًا. الإدخال من كمبيوتر العرض غير مدعوم حاليًا.</p>
 <label>رقم الجهاز<input aria-label="رقم الجهاز" type="number" min="0" max="15" value={mapping.deviceIndex} onChange={e => onChange({ ...mapping, deviceIndex: Number(e.target.value) })}/></label>
 <div className={styles.device} dir="ltr">{device ? `${device.id} · axes: ${device.axes.map(v => v.toFixed(2)).join(' / ')} · buttons: ${device.buttons.map((v, i) => v > 0.1 ? i : '').filter(v => v !== '').join(', ')}` : 'No local Gamepad detected'}</div>
 {axes.map(key => <fieldset key={key}><legend>{labels[key]}</legend><div className={styles.mapping}>
 <label>المحور<select aria-label={`${labels[key]} المحور`} value={mapping[key].index} onChange={e => axis(key, { index: Number(e.target.value) })}><option value={-1}>غير معيّن</option>{Array.from({ length: device?.axes.length ?? 8 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label>
 {(key === 'throttle' || key === 'brake' ? ['rest', 'pressed'] : ['min', 'center', 'max']).map(field => <label key={field}>{({ rest: 'راحة', pressed: 'ضغط', min: 'يسار / أدنى', center: 'مركز', max: 'يمين / أقصى' } as Record<string, string>)[field]}<input type="number" min="-1" max="1" step="0.01" aria-label={`${labels[key]} ${field}`} value={mapping[key][field as keyof Axis] as number} onChange={e => axis(key, { [field]: Number(e.target.value) })}/><button type="button" disabled={!device || mapping[key].index < 0} onClick={() => axis(key, { [field]: device?.axes[mapping[key].index] ?? 0 })}>التقط</button></label>)}
 <label className={styles.check}><input type="checkbox" checked={mapping[key].inverted} onChange={e => axis(key, { inverted: e.target.checked })}/> عكس</label><label>منطقة محايدة<input type="number" min="0" max="0.8" step="0.05" value={mapping[key].deadZone} onChange={e => axis(key, { deadZone: Number(e.target.value) })}/></label>
 </div></fieldset>)}
 <div className={styles.mapping}>{(['waterButton', 'brakeButton'] as const).map(k => <label key={k}>{k === 'waterButton' ? 'زر الماء' : 'زر الفرامل'}<input type="number" min="-1" max="63" value={mapping[k]} onChange={e => onChange({ ...mapping, [k]: Number(e.target.value) })}/></label>)}</div>
 <p className={styles.note}>−1 يعني غير معيّن. الانقطاع يوقف الجلسة بأمان. إعدادات المعايرة فقط تُحفظ محليًا، دون هوية المريض.</p></details>;
}
