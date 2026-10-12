'use client';
import { useMemo, type ComponentType } from 'react';
import { decode, isCc3Live, type ColorChaseLiveSession } from '@/lib/colorchase3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { GardenView } from '../colorchase3d/GardenView';

/**
 * Display-registry module for `color-chase`: a session tagged `engine: "cc3"` renders The Lost Colors garden from the
 * shared live record (read-only); an untagged session is the original game and renders with the original module,
 * exactly as before (the rollback path).
 */
export function ColorChaseDisplayModule({ Legacy, ...props }: SharedGameDisplayProps & { Legacy: ComponentType<SharedGameDisplayProps> }) {
  return isCc3Live(props.session) ? <Garden live={props.session as unknown as ColorChaseLiveSession} /> : <Legacy {...props} />;
}

function Garden({ live }: { live: ColorChaseLiveSession }) {
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.cc3?.heartbeatAt);
  return state ? <GardenView state={state} full connected={alive} /> : null;
}
