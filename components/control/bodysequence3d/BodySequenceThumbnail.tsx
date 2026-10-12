import type { CSSProperties } from 'react';

/** Neutral vector fallback shown only until the real gameplay screenshot loads (see realGameThumbnails.ts). */
export function BodySequenceThumbnail() {
  const lane: CSSProperties = { position: 'absolute', top: '18%', width: '24%', height: '46%', borderRadius: 10, border: '3px solid #38d9ff', background: 'rgba(56,217,255,0.08)' };
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#0a1230,#2a1a5a)', overflow: 'hidden' }}>
      <div style={{ ...lane, left: '14%' }} />
      <div style={{ ...lane, left: '38%', borderColor: '#ff9a1f', background: 'rgba(255,154,31,0.22)' }} />
      <div style={{ ...lane, left: '62%' }} />
      <div style={{ position: 'absolute', left: '28%', width: '44%', top: '72%', height: '14%', borderRadius: 8, border: '3px solid #38d9ff', background: 'rgba(56,217,255,0.08)' }} />
    </div>
  );
}
