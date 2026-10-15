'use client';
import { ControlPageNav } from "@/components/control/nav/ControlPageNav";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStaffDb } from '@/lib/realtime/firebaseClient';
import { writeSpacePilotSensor } from '@/lib/realtime/spacePilotRepository';
import { subscribeToLiveSession } from '@/lib/realtime/sessionRepository';
import { LOCAL_POINTER_CHANNEL_NAME } from '@/lib/display/LocalPointerChannel';
import { decodeCheckpoint, isSpacePilotLive, type SpacePilotLiveSession } from '@/lib/spacepilot3d/cloudState';
import { isPointer, isRecord, isSequence } from '@/lib/spacepilot3d/sessionContract';
import { SENSOR_STALE_MS } from '@/lib/spacepilot3d/sensorInput';

/** Adapter for the existing final filtered pointer. No BLE, calibration or motion processing. */
export function SpacePilotSensorSource() {
  const [status, setStatus] = useState('waiting'), [error, setError] = useState('');
  useEffect(() => {
    const db = getStaffDb(), sourceToken = crypto.randomUUID(), channel = new BroadcastChannel(LOCAL_POINTER_CHANNEL_NAME);
    let disposed = false, room: { sessionId: string; ownerToken: string; epoch: number; run: number } | null = null, latest: { x: number; y: number; visible: boolean; sentAtMs: number } | null = null,
      inputEpoch = 0, sequence = 0, localSequence = -1, lastLocalTimestamp = -Infinity, lastReceived = -Infinity, busy = false;
    // The relay follows whichever Space Pilot 3D session is live on the shared record (same staff account on this laptop).
    const stop = subscribeToLiveSession(db, record => {
      if (!record || record.gameId !== 'space-pilot' || !isSpacePilotLive(record.session)) { room = null; return; }
      const live = record.session as SpacePilotLiveSession, c = decodeCheckpoint(live); if (!c) return;
      room = { sessionId: live.sessionId, ownerToken: live.sp3.ownerToken, epoch: live.sp3.epoch, run: live.sp3.run }; inputEpoch = c.state.inputEpoch;
    });
    channel.onmessage = e => {
      const p = e.data;
      if (!isRecord(p) || p.role !== 'RIGHT_HAND' || !isPointer(p) || !isSequence(p.seq) ||
        typeof p.visible !== 'boolean' || typeof p.sentAtMs !== 'number' || !Number.isFinite(p.sentAtMs) || Date.now() - p.sentAtMs < 0 || Date.now() - p.sentAtMs > SENSOR_STALE_MS) return;
      if (p.sentAtMs < lastLocalTimestamp || (p.seq <= localSequence && (Date.now() - lastReceived <= SENSOR_STALE_MS || p.sentAtMs <= lastLocalTimestamp))) return;
      lastLocalTimestamp = p.sentAtMs; lastReceived = Date.now(); localSequence = p.seq; latest = { x: p.x, y: p.y, visible: p.visible, sentAtMs: p.sentAtMs };
    };
    const timer = setInterval(() => {
      if (disposed || !room || busy || !latest) return;
      const available = !!latest && latest.visible && Date.now() - latest.sentAtMs <= SENSOR_STALE_MS;
      setStatus(available ? 'tracking' : 'waiting');
      busy = true;
      void writeSpacePilotSensor(db, room, inputEpoch, sourceToken, ++sequence, available && latest ? latest : { x: .5, y: .5, visible: false }, available ? Math.max(0, Date.now() - latest.sentAtMs) : 0)
        .then(() => { if (!disposed) setError(''); })
        .catch(e => { if (!disposed) setError(e.message); })
        .finally(() => { busy = false; });
    }, 100);
    return () => { disposed = true; clearInterval(timer); stop(); channel.close(); };
  }, []);
  return <main dir="rtl" lang="ar" className="min-h-dvh bg-slate-50 p-8 text-slate-800"><section className="mx-auto max-w-2xl space-y-5 rounded-3xl bg-white p-8 shadow-sm">
    <ControlPageNav backHref="/control/space-pilot" backLabel="قائد الفضاء" />
    <h1 className="text-2xl font-bold">حاسوب مستشعر قائد الفضاء</h1>
    <p>سجّل الدخول بحساب المعالج نفسه على الحاسوب المتصل بالمستشعر. صِل اليد اليمنى من إعداد المستشعر الحالي ثم عد إلى هذا الرابط. أبقِ هذه الشاشة مفتوحة.</p>
    <Link className="inline-block rounded-xl bg-teal-700 px-5 py-3 font-bold text-white" href="/control/sensor-setup-prototype">إعداد المستشعر</Link>
    <p data-testid="sensor-relay-status" data-status={status} role="status">{status === 'tracking' ? 'اليد اليمنى متصلة · تُرسل إلى تحكم المعالج' : 'بانتظار اليد اليمنى · التحكم اليدوي متاح للمعالج'}</p>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4">{error}</p>}
  </section></main>;
}
