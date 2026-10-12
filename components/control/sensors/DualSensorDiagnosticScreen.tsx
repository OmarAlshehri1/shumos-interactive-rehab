'use client';

import { useEffect, useRef, useState } from 'react';
import { dualStreamStatus } from '@/lib/physicalInput/dualSensorDiagnostic';
import { useDualSensorRuntime, type DualSensorRuntime, type SensorRuntime } from './SensorRuntimeProvider';
import { SensorReplaceRoleControls } from './SensorRoleAssignmentControls';

const button = 'min-h-12 rounded-xl border border-slate-300 px-4 py-2 font-semibold disabled:opacity-40';
const vector = (values: readonly number[] | undefined) => values?.map(v => Number.isFinite(v) ? v.toFixed(2) : '—').join(' / ') ?? '—';

function SensorCard({ runtime, fresh, age }: { runtime: SensorRuntime; fresh: boolean; age: number | null }) {
  const right = runtime.role === 'RIGHT_HAND';
  return <section data-testid={right ? 'right-sensor' : 'left-sensor'} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-bold">{right ? 'اليد اليمنى' : 'اليد اليسرى'} <span dir="ltr" className="text-sm text-slate-500">{runtime.role}</span></h2>
    <div className="my-4 flex flex-wrap gap-2">
      <button type="button" className={`${button} bg-teal-700 text-white`} disabled={runtime.connected || runtime.connecting || runtime.reconnecting} onClick={() => void runtime.connect()}>{runtime.connecting ? 'جاري الربط…' : `ربط ${right ? 'اليمنى' : 'اليسرى'}`}</button>
      <button type="button" className={button} disabled={!runtime.connected && !runtime.reconnecting} onClick={() => void runtime.disconnect()}>فصل {right ? 'اليمنى' : 'اليسرى'}</button>
    </div>
    <p className={fresh ? 'font-semibold text-teal-700' : 'font-semibold text-amber-700'}>{runtime.reconnecting ? 'جاري إعادة الاتصال تلقائيًا…' : runtime.connected ? fresh ? 'متصل · قراءات حديثة' : 'متصل · بانتظار قراءات حديثة' : 'غير متصل'}</p>
    <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
      <dt>اسم الجهاز</dt><dd dir="ltr" className="break-all">{runtime.deviceName ?? '—'}</dd>
      <dt>هوية Chrome</dt><dd dir="ltr" className="break-all">{runtime.deviceId ?? '—'}</dd>
      <dt>حالة الاتصال</dt><dd dir="ltr">{runtime.connection}</dd>
      <dt>معدل القراءات</dt><dd dir="ltr">{runtime.connected && runtime.liveRateHz !== null ? `${runtime.liveRateHz.toFixed(1)} Hz` : '—'}</dd>
      <dt>عمر آخر قراءة</dt><dd dir="ltr">{age !== null && Number.isFinite(age) && age >= 0 ? `${Math.round(age)} ms` : '—'}</dd>
      <dt>وقت القراءة</dt><dd dir="ltr">{runtime.sample?.timestampMs.toFixed(1) ?? '—'} ms</dd>
      <dt>الاتجاه X / Y / Z</dt><dd dir="ltr">{vector(runtime.sample?.anglesDeg)} °</dd>
      <dt>الحركة X / Y / Z</dt><dd dir="ltr">{vector(runtime.sample?.gyroscopeDps)} °/s</dd>
      <dt>التسارع X / Y / Z</dt><dd dir="ltr">{vector(runtime.sample?.accelerationG)} g</dd>
      <dt>التمركز الحالي</dt><dd>{runtime.centered ? 'جاهز' : 'بانتظار القراءة'}</dd>
    </dl>
    {runtime.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{runtime.error}</p>}
    {runtime.rateNote && <p className="mt-3 text-sm text-slate-500">{runtime.rateNote}</p>}
  </section>;
}

export function DualSensorDiagnosticScreen() {
  const streams = useDualSensorRuntime();
  const latest = useRef(streams);
  const [snapshot, setSnapshot] = useState<{ streams: DualSensorRuntime; now: number } | null>(null);
  const [bluetoothSupported, setBluetoothSupported] = useState<boolean | null>(null);
  useEffect(() => { latest.current = streams; }, [streams]);
  useEffect(() => {
    // Sample the readings and clock together so newer BLE packets cannot appear future-dated.
    const timer = window.setInterval(() => { setSnapshot({ streams: latest.current, now: performance.now() }); setBluetoothSupported(window.isSecureContext && 'bluetooth' in navigator); }, 250);
    return () => window.clearInterval(timer);
  }, []);
  const { right, left } = snapshot?.streams ?? streams;
  const status = dualStreamStatus(right, left, snapshot?.now ?? 0);
  return <main lang="ar" dir="rtl" className="min-h-dvh bg-slate-50 p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">اختبار حسّاسي WT901BLECL الحقيقيين</h1>
      <p className="mt-3 text-slate-600">اختبار محلي لاتصال اليد اليمنى واليسرى. يستخدم محوّل BLE الحالي؛ لا ينشئ جلسة لعبة ولا يرسل قراءات إلى Firebase.</p>
      {bluetoothSupported === false && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">يلزم Google Chrome على هذا الجهاز وعنوان localhost، مع السماح باستخدام Bluetooth.</p>}
      <p role="status" data-testid="dual-stream-status" data-simultaneous={status.simultaneous} className={`my-5 rounded-xl p-4 font-semibold ${status.duplicate ? 'bg-red-100 text-red-800' : status.simultaneous ? 'bg-teal-100 text-teal-900' : 'bg-amber-50 text-amber-900'}`}>
        {status.duplicate ? 'تعارض: الجهاز نفسه ظاهر في الدورين. افصل الدور الأخير؛ لا تعتمد هذا الاختبار.' : status.simultaneous ? 'حساسان مختلفان يرسلان قراءات حديثة معًا. تحقق من استقلال الحركة يدويًا.' : 'بانتظار حسّاسين مختلفين، لكل منهما قراءات حديثة خلال آخر ثانية.'}
      </p>
      <div className="grid gap-5 md:grid-cols-2"><SensorCard runtime={right} fresh={status.rightFresh} age={status.rightAgeMs} /><SensorCard runtime={left} fresh={status.leftFresh} age={status.leftAgeMs} /></div>
      <ol className="mt-6 list-inside list-decimal space-y-2 text-sm text-slate-600">
        <li>اربط اليمنى أولًا، ثم اربط الحساس الفعلي الآخر لليسرى. تطابق الاسمين لا يعني تطابق الجهازين؛ قارن هويتي Chrome.</li>
        <li>حرّك اليمنى فقط، ثم اليسرى فقط، ثم الاثنتين؛ راقب اتجاه وحركة كل بطاقة.</li>
        <li>افصل حساسًا واحدًا وأعد ربطه. يجب أن تستمر قراءات الحساس الآخر وأن تبقى هوية دوره ثابتة.</li>
        <li>اختيار الجهاز نفسه للدور الآخر يجب أن يُرفض، دون قطع الاتصال الأول.</li>
      </ol>
      <details className="mt-6 rounded-xl border border-amber-200 p-4"><summary className="cursor-pointer font-semibold">إذا كان هناك تعيين سابق خاطئ</summary><p className="my-3 text-sm">استخدم الاستبدال فقط لتغيير تعيين جهاز خاطئ. هذا الإجراء يمحو ربط الدور بالجهاز السابق؛ لا يغيّر إعدادات معايرة حركة اليد.</p><SensorReplaceRoleControls /></details>
      <p className="mt-5 text-sm text-slate-500">نجاح العتاد لا يُعتمد إلا بعد اختبارك الفعلي. يبقى الحساسان متصلين عند التنقل داخل /control؛ افصلهما بعد الاختبار. لا تفتح صفحة تشخيص أخرى أثناءه.</p>
    </div>
  </main>;
}
