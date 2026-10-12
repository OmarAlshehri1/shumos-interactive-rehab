'use client';
import { useMemo, type ComponentType } from 'react';
import { decode, isFp3Live, type FootstepsLiveSession } from '@/lib/footsteps3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { FootView } from '../footsteps3d/FootView';

/**
 * Display-registry module for `follow-the-footsteps`: a session tagged `engine: "fp3"` renders the Enchanted Forest from
 * the shared live record (read-only); an untagged session is the original game and renders with the original module,
 * exactly as before (the rollback path).
 */
export function FootstepsDisplayModule({ Legacy, ...props }: SharedGameDisplayProps & { Legacy: ComponentType<SharedGameDisplayProps> }) {
  return isFp3Live(props.session) ? <Forest live={props.session as unknown as FootstepsLiveSession} /> : <Legacy {...props} />;
}

function Forest({ live }: { live: FootstepsLiveSession }) {
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.fp3?.heartbeatAt);
  return state ? <FootView state={state} full connected={alive} /> : null;
}
