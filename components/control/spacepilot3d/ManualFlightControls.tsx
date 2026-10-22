'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlightMode } from '@/lib/spacepilot3d/rings';

export function ManualFlightControls({ send, mode, sensor, disabled }: {
  send: (x: number, y: number, override: boolean) => void; mode: FlightMode; sensor: boolean; disabled: boolean;
}) {
  const held = useRef(new Map<number, [number, number]>()), takeover = useRef(false);
  const [active, setActive] = useState(false);
  const publish = useCallback(() => {
    let x = 0, y = 0;
    for (const [dx, dy] of held.current.values()) { x += dx; y += dy; }
    const override = takeover.current || held.current.size > 0;
    send(Math.sign(x), mode === 'ADVANCED' ? Math.sign(y) : 0, override);
    setActive(override);
  }, [send, mode]);
  const clear = useCallback(() => { held.current.clear(); takeover.current = false; send(0, 0, false); setActive(false); }, [send]);
  useEffect(() => {
    const pointers = held.current;
    const hidden = () => { if (document.hidden) clear(); };
    window.addEventListener('blur', clear); window.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', clear); window.removeEventListener('pagehide', clear); document.removeEventListener('visibilitychange', hidden); pointers.clear(); takeover.current = false; send(0, 0, false); };
  }, [clear, send]);
  useEffect(() => { if (disabled) { held.current.clear(); takeover.current = false; send(0, 0, false); } }, [disabled, send]);
  const directionNames: Record<string, string> = { 'up-left': 'أعلى اليسار', up: 'أعلى', 'up-right': 'أعلى اليمين', left: 'يسار', neutral: 'المنتصف', right: 'يمين', 'down-left': 'أسفل اليسار', down: 'أسفل', 'down-right': 'أسفل اليمين' };
  const directions: [string, string, number, number][] = [
    ['up-left', '↖', -1, 1], ['up', '↑', 0, 1], ['up-right', '↗', 1, 1],
    ['left', '←', -1, 0], ['neutral', '●', 0, 0], ['right', '→', 1, 0],
    ['down-left', '↙', -1, -1], ['down', '↓', 0, -1], ['down-right', '↘', 1, -1],
  ];
  return <section className="rounded-3xl border border-teal-200 bg-white p-6 shadow-sm" aria-label="التحكم اليدوي بالطيران" data-testid="manual-flight-controls" style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}>
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-bold">توجيه الأخصائي</h2><span role="status">{sensor ? active && !disabled ? 'تحكم المعالج له الأولوية' : 'اليد اليمنى · التحكم اليدوي متاح' : 'تحكم يدوي'}</span></div>
    <p className="my-3 text-sm text-slate-500">اضغط باستمرار للتوجيه. ارفع إصبعك للعودة إلى المنتصف. يمكن لمس اتجاهين معًا.</p>
    <div dir="ltr" className="mx-auto grid max-w-sm grid-cols-3 gap-3">
      {directions.map(([id, label, x, y]) => <button key={id} type="button" data-testid={`flight-${id}`} aria-label={`توجيه ${directionNames[id]}`} disabled={disabled || (mode !== 'ADVANCED' && y !== 0 && x === 0)}
        className="min-h-20 rounded-2xl border border-teal-200 bg-teal-50 text-3xl font-bold text-teal-900 active:bg-teal-200 disabled:opacity-30"
        onContextMenu={e => e.preventDefault()}
        onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); if (id === 'neutral') { clear(); return; } held.current.set(e.pointerId, [x, y]); publish(); }}
        onPointerUp={e => { held.current.delete(e.pointerId); publish(); }}
        onPointerCancel={e => { held.current.delete(e.pointerId); publish(); }}
        onLostPointerCapture={e => { if (held.current.delete(e.pointerId)) publish(); }}
      >{label}</button>)}
    </div>
    {sensor && <button type="button" disabled={disabled} className="mt-4 min-h-14 w-full rounded-xl bg-teal-700 p-3 font-bold text-white disabled:opacity-30" data-testid="manual-override" aria-pressed={active && !disabled}
      onClick={() => { takeover.current = !takeover.current; held.current.clear(); publish(); }}>{active && !disabled ? 'العودة إلى اليد · مطابقة الموضع أولًا' : 'استلام التحكم يدويًا · حتى دون مستشعر'}</button>}
  </section>;
}
