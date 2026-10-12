'use client';
import { useEffect, useRef, useState } from 'react';
import { FireRescueRenderer, type RenderStats } from '@/lib/firerescue3d/renderer';
import { summary, type State } from '@/lib/firerescue3d/engine';
import { STAGES, roadHeading } from '@/lib/firerescue3d/stages';
import { playTone } from '@/lib/audio/primitives';
import styles from './view.module.css';
export function FireRescueView({ state, full = false, connected = true, muted = false }: {
    state: State;
    full?: boolean;
    connected?: boolean;
    muted?: boolean;
}) {
    const host = useRef<HTMLDivElement>(null);
    const renderer = useRef<FireRescueRenderer | null>(null);
    const latest = useRef(state);
    const audio = useRef<AudioContext | null>(null);
    const gain = useRef<GainNode | null>(null);
    const lastCue = useRef('');
    const [error, setError] = useState('');
    const [stats, setStats] = useState<RenderStats | null>(null);
    useEffect(() => { const visual = connected ? state : { ...state, status: 'paused' as const, speed: 0, input: { ...state.input, water: false } }; latest.current = visual; renderer.current?.update(visual); }, [state, connected]);
    useEffect(() => { if (!host.current)
        return; try {
        renderer.current = new FireRescueRenderer(host.current, latest.current, setStats);
    }
    catch (e) {
        queueMicrotask(() => setError(`تعذّر العرض ثلاثي الأبعاد: ${String(e)}`));
    } return () => { renderer.current?.dispose(); renderer.current = null; }; }, []);
    useEffect(() => { if (gain.current)
        gain.current.gain.value = state.config.sound && !muted ? state.config.volume * 0.25 : 0; const cue = `${state.sessionId}:${state.stage}:${state.events.length}:${state.status}`; const prior = lastCue.current; lastCue.current = cue; if (prior && prior !== cue && state.status === 'stage-complete' && audio.current && gain.current && connected) {
        [523, 659, 784].forEach((frequency, i) => playTone(audio.current!, gain.current!, { frequency, startTime: audio.current!.currentTime + i * 0.2, duration: 0.55, peakGain: 0.22 }));
    } }, [state, muted, connected]);
    useEffect(() => () => { void audio.current?.close(); }, []);
    const unlock = () => { if (!state.config.sound || muted)
        return; if (!audio.current) {
        audio.current = new AudioContext();
        gain.current = audio.current.createGain();
        gain.current.gain.value = state.config.volume * 0.25;
        gain.current.connect(audio.current.destination);
    } void audio.current.resume(); };
    const d = STAGES[state.stage], sum = summary(state);
    const turn = roadHeading(state.stage, state.distance + 12) - roadHeading(state.stage, state.distance);
    const instruction = state.phase === 'firefighting' ? 'وجّه الماء' : turn > 0.015 ? 'لف يمين' : turn < -0.015 ? 'لف يسار' : 'قد بهدوء';
    return <section className={`${styles.view} ${full ? styles.full : ''} ${state.config.highContrast ? styles.contrast : ''}`} data-testid="fr-view" data-status={state.status} data-events={state.events.length} data-heading={state.heading.toFixed(3)} data-lateral={state.lateral.toFixed(3)} data-stage={state.stage} data-phase={state.phase} data-distance={state.distance.toFixed(2)} data-aim={`${state.aim.x.toFixed(3)},${state.aim.y.toFixed(3)}`} data-fires={state.fires.map(v => v.toFixed(3)).join(',')} data-fps={stats?.fps} data-draw-calls={stats?.drawCalls} data-triangles={stats?.triangles} data-geometries={stats?.geometries} data-textures={stats?.textures} onPointerDown={unlock}>
  <div ref={host} className={styles.canvas}/>
  <div className={styles.top}><div><span className={styles.brand}>SHUMOS CARE</span><strong>مهمة الإطفاء</strong></div><span className={styles.level}>المستوى {d.level} · المرحلة {state.stage % 3 + 1}</span></div>
  <div className={styles.instruction}><span className={styles.symbol}>{state.phase === 'driving' ? '↗' : '◉'}</span><div><small>{d.name}</small><strong>{instruction}</strong></div></div>
  <div className={styles.bottom}><span className={styles.speed}>{Math.round(state.speed * 3.6)} <small>كم/س</small></span><div className={styles.route}><span>{state.phase === 'driving' ? 'إلى منطقة الإطفاء' : 'إطفاء بهدوء'}</span><div className={styles.progress}><i style={{ width: `${state.phase === 'driving' ? state.distance / d.length * 100 : (1 - state.fires.reduce((a, b) => a + b, 0) / state.fires.length) * 100}%` }}/></div></div><span className={styles.badge}>{state.completed.length}/9 <small>مراحل</small></span></div>
  {state.phase === 'firefighting' && state.status === 'running' && <div className={styles.targets}>{state.fires.map((v, i) => <span key={i} className={v === 0 ? styles.done : ''}>◉ {i + 1} · {Math.round((1 - v) * 100)}٪</span>)}</div>}
  {(error || !connected || state.status !== 'running') && <div className={styles.overlay}><span className={styles.overIcon}>{state.status === 'stage-complete' || state.status === 'ended' ? '✧' : '◉'}</span><h2>{error ? 'العرض يحتاج إلى WebGL' : !connected ? 'ننتظر المعالج' : state.status === 'ready' ? 'لننطلق بهدوء' : state.status === 'paused' ? 'استراحة صغيرة' : state.status === 'stage-complete' ? (state.completed.includes(state.stage) ? 'أحسنت!' : 'ننتقل للمهمة التالية') : 'شكرًا لك!'}</h2><p>{error || (!connected ? 'توقفت الحركة حتى يعود الاتصال' : state.status === 'ended' ? `${sum.driving} رحلات · ${sum.fires} مناطق أُطفئت` : state.status === 'stage-complete' ? 'الغابة أكثر هدوءًا الآن' : state.safety ? 'كل شيء آمن · المعالج يساعدك' : 'المعالج جاهز لمساعدتك')}</p></div>}
  {!full && stats && <span className={styles.performance} dir="ltr">{stats.fps} FPS · {stats.drawCalls} draws</span>}
 </section>;
}
