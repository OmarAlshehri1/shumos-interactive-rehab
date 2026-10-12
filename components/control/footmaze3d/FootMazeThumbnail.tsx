/** Library card artwork (vector fallback): a hedge maze seen from above with a lit route, gold stars and a friendly guardian. */
export function FootMazeThumbnail() {
  const star = (cx: number, cy: number, r: number) => Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.46 : r; return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');
  const route = 'M30 150 H110 V70 H200 V130 H280 V36';
  return (
    <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="fm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7cc752" /><stop offset="1" stopColor="#3f9a3d" /></linearGradient>
        <radialGradient id="fm-glow"><stop offset="0" stopColor="#fff3b0" stopOpacity="0.95" /><stop offset="1" stopColor="#ffc42e" stopOpacity="0" /></radialGradient>
        <filter id="fm-sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="2" dy="3" stdDeviation="2.5" floodOpacity="0.35" /></filter>
      </defs>
      <rect width="320" height="180" fill="url(#fm-g)" />
      {Array.from({ length: 28 }, (_, i) => <circle key={i} cx={(i * 59) % 320} cy={(i * 83) % 180} r={1.6 + (i % 3)} fill={['#ffd23f', '#ff7aa8', '#ffffff', '#b689ff'][i % 4]} opacity="0.7" />)}
      <g stroke="#1f6a2a" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95"><path d={route} /><path d="M110 70 V20" /><path d="M200 130 V160" /></g>
      <g stroke="#3f9a3d" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" fill="none"><path d={route} /><path d="M110 70 V20" /><path d="M200 130 V160" /></g>
      <g stroke="#f3e2bd" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" fill="none"><path d={route} /><path d="M110 70 V20" /><path d="M200 130 V160" /></g>
      <path d={route} fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" />
      {[[60, 150], [110, 110], [155, 70], [200, 100], [240, 130], [280, 90]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="18" fill="url(#fm-glow)" /><polygon points={star(x, y, 9)} fill="#ffc42e" stroke="#fff3b0" strokeWidth="1.4" strokeLinejoin="round" filter="url(#fm-sh)" /></g>)}
      <g filter="url(#fm-sh)" transform="translate(200 50)"><circle r="15" fill="#5ec8ff" /><rect x="-9" y="-6" width="18" height="10" rx="5" fill="#0b2a3a" /><circle cx="-4" cy="-1" r="2.2" fill="#9fffe0" /><circle cx="4" cy="-1" r="2.2" fill="#9fffe0" /><circle cy="-19" r="3.5" fill="#ffd23f" /></g>
      <text x="278" y="30" fontSize="24" textAnchor="middle">🏁</text>
    </svg>
  );
}
