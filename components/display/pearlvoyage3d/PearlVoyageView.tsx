'use client';
/* eslint-disable @next/next/no-img-element -- portraits are in-memory data URLs rendered locally; next/image cannot optimise them */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PearlVoyageRenderer, type RenderStats } from '@/lib/pearlvoyage3d/renderer';
import { collection, summary, type State } from '@/lib/pearlvoyage3d/engine';
import { ENVIRONMENTS, SPECIES, STAGES, type SpeciesId } from '@/lib/pearlvoyage3d/stages';
import { instruction, stageTitle } from '@/lib/pearlvoyage3d/copy';
import { PearlAudio } from '@/lib/pearlvoyage3d/audio';
import { fishPortraits } from '@/lib/pearlvoyage3d/render/portraits';
import styles from './view.module.css';
import type {DisplayEventListener} from '../events';

const SPOKEN: Record<string, string> = { sailing: 'اتجه إلى العلامة', celebrate: 'اكتشفت سمكة جديدة!', stage: 'أحسنت!' };
/**
 * The child's wall display. Read-only: it draws whatever State the therapist's Control publishes. The HUD stays short and
 * large (projector readable), and the collection is shown as an illustrated ocean journal with 3D fish portraits.
 */
export function PearlVoyageView({ state, full = false, connected = true, muted = false, onVoice }: { state: State; full?: boolean; connected?: boolean; muted?: boolean; onVoice?: DisplayEventListener }) {
    const host = useRef<HTMLDivElement>(null);
    const renderer = useRef<PearlVoyageRenderer | null>(null);
    const latest = useRef(state);
    const audio = useRef<PearlAudio | null>(null);
    const prior = useRef<State | null>(null);
    const [error, setError] = useState('');
    const [stats, setStats] = useState<RenderStats | null>(null);
    const [portraits, setPortraits] = useState<Record<string, string>>({});
    const cfg = state.config;
    useEffect(() => { const visual = connected ? state : { ...state, status: state.status === 'running' ? 'paused' as const : state.status, speed: 0 }; latest.current = visual; renderer.current?.update(visual); }, [state, connected]);
    useEffect(() => {
        if (!host.current) return;
        try { renderer.current = new PearlVoyageRenderer(host.current, latest.current, setStats); }
        catch (e) { queueMicrotask(() => setError(`تعذّر العرض ثلاثي الأبعاد: ${String(e)}`)); }
        return () => { renderer.current?.dispose(); renderer.current = null; };
    }, []);
    useEffect(() => { const a = new PearlAudio(); audio.current = a; return () => { a.dispose(); audio.current = null; }; }, []);
    useEffect(() => { audio.current?.configure(cfg.sound && !muted && connected, cfg.music, cfg.volume); }, [cfg.sound, cfg.music, cfg.volume, muted, connected]);
    // cues follow state transitions only, so nothing sounds on a plain re-render
    useEffect(() => {
        const a = audio.current, p = prior.current;
        prior.current = state;
        if (!a || !p || !connected || p.sessionId !== state.sessionId) return;
        const say = (key: string) => { if (full && cfg.voice && cfg.sound && !muted) onVoice?.({type:'game_feedback',text:SPOKEN[key],milestone:key==='stage',volume:cfg.volume,timestamp:Date.now()}); };
        if (state.phase === 'encounter' && p.phase !== 'encounter') { a.appear(); window.setTimeout(() => a.splash(1), 900); }
        if (state.phase === 'encounter' && state.hold - p.hold >= 0.24) a.tick(state.hold);
        if (state.phase === 'celebrate' && p.phase !== 'celebrate') { a.discover(); say('celebrate'); }
        if (state.status === 'stage-complete' && p.status !== 'stage-complete') { a.stageDone(); say('stage'); }
        if (state.status === 'running' && p.status !== 'running' && state.phase === 'sailing') say('sailing');
    }, [state, connected, cfg.voice, cfg.sound, cfg.volume, muted, full, onVoice]);
    const collected = useMemo(() => collection(state), [state]);
    const showGallery = state.status === 'stage-complete' || state.status === 'ended';
    const current = state.phase === 'encounter' ? STAGES[state.stage].markers[state.marker].species : null;
    const ids = useMemo(() => [...new Set([...collected.map(e => e.species), ...(current ? [current] : [])])] as SpeciesId[], [collected, current]);
    const idsKey = ids.join(',');
    useEffect(() => {
        if (!ids.length) return;
        const handle = window.setTimeout(() => setPortraits(fishPortraits(ids)), 30);
        return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsKey]);
    const unlock = () => { audio.current?.unlock(); audio.current?.configure(cfg.sound && !muted && connected, cfg.music, cfg.volume); };
    const def = STAGES[state.stage], sum = summary(state), ins = instruction(state);
    const env = ENVIRONMENTS[def.env];
    const stageEvents = collected.filter(e => e.stage === state.stage);
    const marker = state.phase === 'encounter' ? def.markers[state.marker] : null;
    const holdVisible = state.phase === 'encounter' && state.encounterMs >= 1800;
    const R = 46, CIRC = 2 * Math.PI * R;
    const galleryEvents = state.status === 'ended' ? collected : stageEvents;
    return <section className={`${styles.view} ${full ? styles.full : ''} ${cfg.highContrast ? styles.contrast : ''} ${cfg.reducedMotion ? styles.reduced : ''}`} data-testid="pv-view" data-status={state.status} data-phase={state.phase} data-stage={state.stage} data-marker={state.marker} data-events={state.events.length} data-hold={state.hold.toFixed(3)} data-pos={`${state.x.toFixed(2)},${state.y.toFixed(2)}`} data-heading={state.heading.toFixed(3)} data-speed={state.speed.toFixed(3)} data-fps={stats?.fps} data-draw-calls={stats?.drawCalls} data-triangles={stats?.triangles} data-geometries={stats?.geometries} data-textures={stats?.textures} onPointerDown={unlock}>
        <div ref={host} className={styles.canvas} />
        <div className={styles.top}>
            <div className={`${styles.title} ${styles.glass}`}><span className={styles.brand}>SHUMOS CARE</span><strong>قارب اللؤلؤ</strong></div>
            <div className={`${styles.level} ${styles.glass}`}><span>{stageTitle(state.stage)}</span><span className={styles.dots} aria-label="الاكتشافات">{def.markers.map((_, i) => { const done = state.events.some(e => e.key === `${state.stage}:${i}` && e.outcome !== 'skipped'); return <i key={i} className={`${styles.dot} ${done ? styles.dotDone : i === state.marker ? styles.dotNow : ''}`} />; })}</span></div>
        </div>
        {state.status === 'running' && <div className={`${styles.instruction} ${styles.glass}`}><span className={styles.symbol}>{ins.icon}</span><div><small>{env.nameAr}</small><strong>{ins.text}</strong></div></div>}
        {state.status === 'running' && state.phase === 'sailing' && <div className={`${styles.speed} ${styles.glass}`}>{Math.round(state.speed * 3.6)}<small>كم/س</small></div>}
        {collected.length > 0 && !showGallery && <div className={`${styles.tray} ${styles.glass}`}>{collected.slice(-5).map(e => <span key={e.key} className={styles.chip} title={SPECIES[e.species].nameAr}>{portraits[e.species] ? <img src={portraits[e.species]} alt="" /> : <i className={styles.chipDot} style={{ background: SPECIES[e.species].color }} />}</span>)}<span className={styles.count}>{collected.length}</span></div>}
        {holdVisible && state.status === 'running' && marker && <div className={styles.holdWrap} data-testid="pv-hold-ring"><svg viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="7" /><circle cx="50" cy="50" r={R} fill="none" stroke="url(#pvg)" strokeWidth="7.5" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - state.hold)} transform="rotate(-90 50 50)" /><defs><linearGradient id="pvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd166" /><stop offset="1" stopColor="#5ff0d0" /></linearGradient></defs></svg><div className={styles.holdCore}>{portraits[marker.species] ? <img src={portraits[marker.species]} alt="" /> : <span className={styles.pearlIcon} />}</div><span className={`${styles.holdPct} ${styles.glass}`}>{Math.round(state.hold * 100)}٪</span></div>}
        {(error || !connected || state.status === 'ready' || state.status === 'paused' || showGallery) && <div className={styles.overlay}><div className={`${styles.card} ${styles.glass}`}>
            {showGallery ? <>
                <h2>{state.status === 'ended' ? 'مجموعتك الجميلة' : state.completed.includes(state.stage) ? 'أحسنت!' : 'ننتقل للرحلة التالية'}</h2>
                <p>{state.status === 'ended' ? `${sum.fish} أسماك اكتشفتها · ${state.completed.length} مراحل` : `اكتشفت ${stageEvents.length} من ${def.markers.length}`}</p>
                <div className={styles.gallery} data-testid="pv-gallery">{galleryEvents.length ? galleryEvents.map(e => <div key={e.key} className={styles.fishCard}><div className={styles.portrait}>{portraits[e.species] ? <img src={portraits[e.species]} alt={SPECIES[e.species].nameAr} /> : <i className={styles.fallbackDot} style={{ background: SPECIES[e.species].color }} />}</div><strong>{SPECIES[e.species].nameAr}</strong><span className={styles.badge}>{ENVIRONMENTS[STAGES[e.stage].env].nameAr} · {e.stage % 3 + 1}</span></div>) : <span className={styles.pearlIcon} />}</div>
            </> : <>
                <span className={styles.pearlIcon} />
                <h2>{error ? 'العرض يحتاج إلى WebGL' : !connected ? 'ننتظر المعالج' : state.status === 'ready' ? 'لنبحر بهدوء' : 'استراحة صغيرة'}</h2>
                <p>{error || (!connected ? 'توقف القارب حتى يعود الاتصال' : state.status === 'ready' ? `${env.nameAr} · ${def.name}` : state.safety ? 'كل شيء آمن · المعالج يساعدك' : 'القارب ينتظرك')}</p>
            </>}
        </div></div>}
        {!full && stats && <span className={styles.performance} dir="ltr">{stats.fps} FPS · {stats.drawCalls} draws · {Math.round(stats.triangles / 1000)}k tris</span>}
    </section>;
}
