/** Library card artwork (vector fallback): a lit walking path winding around cones, with guiding arrows and gold stars. */
export function TurnGoThumbnail() {
  const path = 'M-10 150 C 50 140, 70 110, 110 104 S 190 60, 235 66 S 300 30, 340 20';
  const cones = [{ x: 96, y: 66, c: '#ff6a1a' }, { x: 166, y: 124, c: '#e63946' }, { x: 262, y: 100, c: '#2f80ed' }];
  const stars = [{ x: 52, y: 128 }, { x: 136, y: 92 }, { x: 214, y: 82 }, { x: 292, y: 48 }];
  const star = (cx: number, cy: number, r: number) => Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.46 : r; return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');
  return (
    <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="tg-grass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7cc752" /><stop offset="1" stopColor="#3f9a3d" /></linearGradient>
        <radialGradient id="tg-glow"><stop offset="0" stopColor="#fff3b0" stopOpacity="0.95" /><stop offset="1" stopColor="#ffc42e" stopOpacity="0" /></radialGradient>
        <filter id="tg-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="2" dy="3" stdDeviation="2.5" floodOpacity="0.35" /></filter>
      </defs>
      <rect width="320" height="180" fill="url(#tg-grass)" />
      {Array.from({ length: 36 }, (_, i) => <circle key={i} cx={(i * 53) % 320} cy={(i * 97) % 180} r={1.6 + (i % 3)} fill={['#ffd23f', '#ff7aa8', '#ffffff', '#b689ff'][i % 4]} opacity="0.75" />)}
      <path d={path} fill="none" stroke="#3a2c1c" strokeOpacity="0.55" strokeWidth="46" strokeLinecap="round" />
      <path d={path} fill="none" stroke="#f3e2bd" strokeWidth="40" strokeLinecap="round" />
      <path d={path} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="3" strokeDasharray="2 14" strokeLinecap="round" />
      {[[60, 126, -22], [118, 96, -18], [176, 90, -14], [250, 74, -30]].map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`} filter="url(#tg-shadow)"><path d="M-9 6 L0 -8 L9 6" fill="none" stroke="#14243f" strokeOpacity="0.6" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /><path d="M-9 6 L0 -8 L9 6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></g>
      ))}
      {cones.map((c) => (
        <g key={c.x} filter="url(#tg-shadow)">
          <circle cx={c.x} cy={c.y} r="17" fill="none" stroke="#ffc233" strokeWidth="3" opacity="0.85" />
          <rect x={c.x - 9} y={c.y - 9} width="18" height="18" rx="2" fill="#20242c" />
          <circle cx={c.x} cy={c.y} r="8" fill={c.c} /><circle cx={c.x} cy={c.y} r="4.6" fill="#fff" /><circle cx={c.x} cy={c.y} r="1.8" fill={c.c} />
        </g>
      ))}
      {stars.map((s, i) => (
        <g key={i}><circle cx={s.x} cy={s.y} r="22" fill="url(#tg-glow)" /><polygon points={star(s.x, s.y, 11)} fill="#ffc42e" stroke="#fff3b0" strokeWidth="1.6" strokeLinejoin="round" filter="url(#tg-shadow)" /></g>
      ))}
    </svg>
  );
}
