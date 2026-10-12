/** Library card artwork (vector fallback): the neon corridor with four coloured lanes and incoming targets. */
export function RhythmThumbnail() {
  const lanes = ['#ff4d5e', '#19c8ff', '#27e08a', '#ffc233'];
  return (
    <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="rs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07041c" /><stop offset="0.55" stopColor="#3a0f78" /><stop offset="1" stopColor="#c02ad0" /></linearGradient>
        <radialGradient id="rs-glow"><stop offset="0" stopColor="#fff" /><stop offset="0.3" stopColor="#d9a6ff" stopOpacity="0.6" /><stop offset="1" stopColor="#7a2cff" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="320" height="180" fill="url(#rs-sky)" />
      <circle cx="160" cy="72" r="46" fill="url(#rs-glow)" />
      <path d="M0 180 L0 150 L150 76 L170 76 L320 150 L320 180Z" fill="#0b0626" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={160 + (i - 2) * 4} y1="76" x2={160 + (i - 2) * 92} y2="180" stroke="#fff" strokeOpacity="0.85" strokeWidth={i === 0 || i === 4 ? 2 : 1} />
      ))}
      {lanes.map((c, i) => {
        const x = (z: number) => 160 + (i - 1.5) * 74 * z;
        return [0.35, 0.62, 0.95].map((z, k) => (
          <rect key={`${i}-${k}`} x={x(z) - 24 * z} y={76 + 100 * z - 8 * z} width={48 * z} height={16 * z} rx={3 * z} fill={c} opacity={(i + k) % 3 === 0 ? 0.25 : 0.95} />
        ));
      })}
      <g fill="#fff" fillOpacity="0.92"><ellipse cx="110" cy="164" rx="5" ry="7" /><ellipse cx="210" cy="164" rx="5" ry="7" /></g>
    </svg>
  );
}
