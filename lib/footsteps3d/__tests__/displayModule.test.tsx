import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FootstepsDisplayModule } from '@/components/display/games/FootstepsDisplayModule';
import { createState, reduce } from '../engine';
import { makeLive } from '../live';
import type { SharedGameDisplayProps } from '@/components/display/gameDisplayRegistry';

const Legacy = () => createElement('div', { 'data-testid': 'legacy-footsteps' }, 'legacy');
const props = (session: unknown) => ({ session } as unknown as SharedGameDisplayProps);

describe('Follow the Footsteps display routing', () => {
  it('an untagged (original) session is rendered by the original module', () => {
    const html = renderToStaticMarkup(createElement(FootstepsDisplayModule, { ...props({ sessionId: 'a', seed: 1, config: { childFirstName: 'x' }, gameState: 'WELCOME' }), Legacy }));
    expect(html).toContain('legacy-footsteps');
    expect(html).not.toContain('foot-display');
  });
  it('an fp3-tagged session is rendered by the Enchanted Forest, with the legacy module untouched', () => {
    const s = reduce(createState('route-1'), { type: 'start', at: 1000 });
    const html = renderToStaticMarkup(createElement(FootstepsDisplayModule, { ...props(makeLive(s, 'uid', 'ليلى', { controlTabId: 't', heartbeatAt: 1 })), Legacy }));
    expect(html).toContain('data-testid="foot-display"');
    expect(html).toContain('data-status="running"');
    expect(html).not.toContain('legacy-footsteps');
  });
  it('a tagged but corrupt record renders nothing (never the wrong game, never a guess)', () => {
    const s = reduce(createState('route-2'), { type: 'start', at: 1000 });
    const rec = makeLive(s, 'uid', '', { controlTabId: 't', heartbeatAt: 1 });
    const html = renderToStaticMarkup(createElement(FootstepsDisplayModule, { ...props({ ...rec, fp3: { ...rec.fp3, payload: '{bad' } }), Legacy }));
    expect(html).not.toContain('legacy-footsteps');
    expect(html).not.toContain('foot-display');
  });
});
