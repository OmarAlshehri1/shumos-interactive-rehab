/** Library card artwork: the garden half gray, half in color, with five large shaped zones. Original artwork. */
export function ColorChaseGardenThumbnail() {
  const zones = [
    { x: 1.7, y: 4.5, c: '#e63946', d: '#8f1d2c', s: 'flower' },
    { x: 3.6, y: 2.4, c: '#2f78f0', d: '#173f93', s: 'drop' },
    { x: 5.6, y: 4.3, c: '#2ea84f', d: '#14612b', s: 'leaf' },
    { x: 7.4, y: 2.5, c: '#f7b500', d: '#9a6a00', s: 'sun' },
    { x: 8.5, y: 4.9, c: '#8e44d8', d: '#4e1c8a', s: 'gem' },
  ] as const;
  return (
    <svg viewBox="0 0 10 6.4" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="ccg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9aa59a" /><stop offset="0.42" stopColor="#8fa58a" /><stop offset="0.62" stopColor="#7cc65a" /><stop offset="1" stopColor="#4fa046" /></linearGradient>
        <radialGradient id="ccw" cx="0.5" cy="0.4"><stop offset="0" stopColor="#bfe9ff" /><stop offset="1" stopColor="#3f88e0" /></radialGradient>
        <radialGradient id="ccs"><stop offset="0" stopColor="#fff2b8" stopOpacity="0.9" /><stop offset="1" stopColor="#ffd25a" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="10" height="6.4" fill="url(#ccg)" />
      <path d="M-0.4 4.6 C2 3.7, 3.6 5.2, 5.2 4.2 S8.4 3.4, 10.4 4.2" stroke="#d9c9a0" strokeWidth="0.55" fill="none" opacity="0.65" strokeLinecap="round" />
      <circle cx="6.6" cy="1.2" r="1.8" fill="url(#ccs)" />
      {/* trees: gray on the left, green on the right */}
      {[[0.5, 0.7, 0.9, '#8a948a'], [2.1, 0.35, 0.8, '#8c9a8c'], [5.0, 0.5, 0.9, '#5ca64c'], [9.3, 0.7, 1.0, '#48984a']].map(([x, y, r, c], i) => (
        <g key={i}><circle cx={(x as number) + 0.12} cy={(y as number) + 0.14} r={r as number} fill="#06240f" opacity="0.25" /><circle cx={x as number} cy={y as number} r={r as number} fill={c as string} /><circle cx={(x as number) - 0.2} cy={(y as number) - 0.25} r={(r as number) * 0.55} fill="#ffffff" opacity="0.18" /></g>
      ))}
      {/* fountain: the water has come back */}
      <ellipse cx="4.8" cy="5.5" rx="0.95" ry="0.55" fill="#b9b2a4" />
      <ellipse cx="4.8" cy="5.45" rx="0.78" ry="0.42" fill="url(#ccw)" />
      <path d="M4.8 5.4 Q4.8 4.9 4.55 4.75 M4.8 5.4 Q4.8 4.9 5.05 4.75" stroke="#e8f8ff" strokeWidth="0.07" fill="none" strokeLinecap="round" />
      {/* flowers: gray on the left, red on the right of the bed */}
      {[[0.4, 5.6, '#a7a7a7'], [0.9, 5.9, '#a2a2a2'], [1.3, 5.5, '#aaaaaa'], [9.0, 5.7, '#e63946'], [9.5, 5.4, '#f04a56'], [8.7, 6.0, '#e63946']].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r="0.16" fill={c as string} />
      ))}
      {zones.map((z, i) => (
        <g key={i}>
          <circle cx={z.x} cy={z.y} r="1.02" fill="#102010" opacity="0.2" />
          <circle cx={z.x} cy={z.y} r="0.96" fill={z.c} stroke="#ffffff" strokeWidth="0.1" opacity="0.96" />
          <circle cx={z.x} cy={z.y} r="0.96" fill="none" stroke={z.d} strokeWidth="0.04" />
          {z.s === 'flower' && [0, 1, 2, 3, 4].map((k) => <circle key={k} cx={z.x + Math.cos((k / 5) * 6.283 - 1.57) * 0.3} cy={z.y + Math.sin((k / 5) * 6.283 - 1.57) * 0.3} r="0.22" fill="#fff" />)}
          {z.s === 'drop' && <path d={`M${z.x} ${z.y - 0.55} C${z.x} ${z.y - 0.55} ${z.x - 0.4} ${z.y - 0.05} ${z.x - 0.4} ${z.y + 0.17} A0.4 0.4 0 0 0 ${z.x + 0.4} ${z.y + 0.17} C${z.x + 0.4} ${z.y - 0.05} ${z.x} ${z.y - 0.55} ${z.x} ${z.y - 0.55} Z`} fill="#fff" />}
          {z.s === 'leaf' && <path d={`M${z.x} ${z.y + 0.5} C${z.x - 0.45} ${z.y + 0.2} ${z.x - 0.5} ${z.y - 0.2} ${z.x - 0.42} ${z.y - 0.5} C${z.x} ${z.y - 0.45} ${z.x + 0.5} ${z.y - 0.25} ${z.x + 0.5} ${z.y + 0.05} C${z.x + 0.5} ${z.y + 0.3} ${z.x + 0.3} ${z.y + 0.48} ${z.x} ${z.y + 0.5} Z`} fill="#fff" />}
          {z.s === 'sun' && <polygon points={Array.from({ length: 20 }, (_, k) => { const a = (k / 20) * 6.283 - 1.57; const r = k % 2 ? 0.28 : 0.52; return `${z.x + Math.cos(a) * r},${z.y + Math.sin(a) * r}`; }).join(' ')} fill="#fff" />}
          {z.s === 'gem' && <polygon points={`${z.x},${z.y - 0.52} ${z.x + 0.46},${z.y - 0.1} ${z.x},${z.y + 0.52} ${z.x - 0.46},${z.y - 0.1}`} fill="#fff" />}
        </g>
      ))}
    </svg>
  );
}
