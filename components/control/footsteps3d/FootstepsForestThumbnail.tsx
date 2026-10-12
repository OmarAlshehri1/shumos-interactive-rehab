/** Library card artwork: an enchanted forest with a stream, five stepping stones and one glowing in gold. Original artwork. */
export function FootstepsForestThumbnail() {
  const stones = [[1.4, 5.6], [3.2, 4.6], [5.0, 4.9], [6.8, 3.7], [8.6, 3.2]] as const;
  return (
    <svg viewBox="0 0 10 6.4" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd05a" /><stop offset="1" stopColor="#4f9a45" /></linearGradient>
        <linearGradient id="fw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7fe0dc" /><stop offset="1" stopColor="#3aa5c8" /></linearGradient>
        <radialGradient id="fglow"><stop offset="0" stopColor="#ffe9a8" stopOpacity="0.95" /><stop offset="1" stopColor="#ffc247" stopOpacity="0" /></radialGradient>
        <radialGradient id="fstone" cx="0.4" cy="0.35"><stop offset="0" stopColor="#d9d0c0" /><stop offset="1" stopColor="#a39a8a" /></radialGradient>
      </defs>
      <rect width="10" height="6.4" fill="url(#fg)" />
      <path d="M-0.5 3.9 C 2 3.1, 3.5 5.4, 5.6 4.3 S 8.8 3.0, 10.5 4.0 L 10.5 5.4 C 8.7 4.4, 7 5.9, 5.3 5.6 S 1.6 4.6, -0.5 5.2 Z" fill="url(#fw)" opacity="0.95" />
      <path d="M0 4.4 C 2 3.9, 3.6 5.4, 5.5 4.9 S 8.8 3.8, 10 4.5" stroke="#e8ffff" strokeWidth="0.06" fill="none" opacity="0.7" />
      {[[0.5, 0.6, 1.1], [2.2, 0.2, 0.9], [4.4, 0.35, 1.0], [6.8, 0.2, 0.95], [9.2, 0.6, 1.2], [0.2, 5.9, 0.9], [9.6, 5.8, 1.0]].map(([x, y, r], i) => (
        <g key={i}><circle cx={x + 0.12} cy={y + 0.14} r={r} fill="#06240f" opacity="0.28" /><circle cx={x} cy={y} r={r} fill={['#4aa04a', '#3f8f43', '#5bb04a'][i % 3]} /><circle cx={x - 0.2} cy={y - 0.25} r={r * 0.55} fill="#7cc65a" opacity="0.7" /></g>
      ))}
      {[[1, 1.9, '#ffd1e8'], [2.4, 2.4, '#ffe27a'], [8, 1.6, '#ffffff'], [9.1, 2.3, '#ffb18c'], [0.6, 3.1, '#ffffff'], [7.6, 5.7, '#d9c2ff']].map(([x, y, c], i) => <circle key={i} cx={x as number} cy={y as number} r="0.09" fill={c as string} />)}
      <circle cx={stones[3][0]} cy={stones[3][1]} r="1.5" fill="url(#fglow)" />
      {stones.map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x + 0.1} cy={y + 0.16} rx="0.7" ry="0.5" fill="#000" opacity="0.28" />
          <ellipse cx={x} cy={y} rx="0.66" ry="0.54" fill={i === 3 ? '#f3dc9a' : 'url(#fstone)'} stroke={i === 3 ? '#ffc247' : 'none'} strokeWidth="0.07" />
          {i === 3 && <g fill="#fff6dc"><ellipse cx={x - 0.1} cy={y + 0.05} rx="0.1" ry="0.17" /><ellipse cx={x + 0.12} cy={y - 0.03} rx="0.1" ry="0.17" /></g>}
        </g>
      ))}
    </svg>
  );
}
