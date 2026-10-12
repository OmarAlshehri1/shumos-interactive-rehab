import { getLayout, hexCorners } from '@/lib/safehexarena3d/geometry';

const LAYOUT = getLayout(9, 16 / 9);
// Frame the arena inside a card-shaped (about 1.8:1) box so the artwork fills the card without cropping any tile.
const VB = (() => {
  const b = LAYOUT.bounds;
  const w = b.width + 1;
  const h = Math.max(w / 1.8, b.height + 1);
  return { x: b.minX - 0.5, y: (b.minY + b.maxY) / 2 - h / 2, w, h };
})();

/** Library card artwork: the nine-tile arena with one warning tile and a tile that has gone quiet. */
export function HexThumbnail() {
  const fills: Record<number, string> = { 2: '#ffa21f', 8: '#233a73' };
  return (
    <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: 'block', background: 'radial-gradient(circle at 50% 40%, #12306b, #050b1c)' }}>
      {Array.from({ length: 9 }, (_, i) => {
        const c = LAYOUT.centers[i];
        const pts = hexCorners(c, 0.92).map((p) => `${p.x},${p.y}`).join(' ');
        return (
          <g key={i}>
            <polygon points={hexCorners({ x: c.x, y: c.y + 0.12 }, 0.92).map((p) => `${p.x},${p.y}`).join(' ')} fill="#06122c" opacity="0.7" />
            <polygon points={pts} fill={fills[i] ?? '#2f72e6'} stroke="#8fc0ff" strokeWidth="0.06" strokeOpacity="0.6" opacity={i === 8 ? 0.6 : 1} />
            {i === 2 && <text x={c.x} y={c.y + 0.3} textAnchor="middle" fontSize="0.9" fill="#fff4dc" fontWeight="700">!</text>}
            {i === 0 && <text x={c.x} y={c.y + 0.25} textAnchor="middle" fontSize="0.7" fill="#fff">👣</text>}
          </g>
        );
      })}
    </svg>
  );
}
