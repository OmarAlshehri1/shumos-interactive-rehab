/** Library illustration only (static SVG). The Display draws the live 3D scene. */
export function RunnerQuestThumbnail() {
  return (
    <svg viewBox="0 0 320 140" className="aspect-[16/7] w-full rounded-t-2xl" aria-hidden="true">
      <defs>
        <linearGradient id="rq-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4aa3f0" /><stop offset="1" stopColor="#d9f1ff" /></linearGradient>
        <linearGradient id="rq-path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9c9a3" /><stop offset="1" stopColor="#c9b88f" /></linearGradient>
      </defs>
      <rect width="320" height="140" fill="url(#rq-sky)" />
      <ellipse cx="60" cy="24" rx="26" ry="9" fill="#fff" opacity=".9" /><ellipse cx="82" cy="20" rx="18" ry="8" fill="#fff" opacity=".9" />
      <ellipse cx="250" cy="30" rx="24" ry="8" fill="#fff" opacity=".85" />
      <ellipse cx="80" cy="84" rx="120" ry="30" fill="#8cc4a8" /><ellipse cx="250" cy="88" rx="130" ry="32" fill="#6fb77a" />
      <rect y="80" width="320" height="60" fill="#58b04c" />
      <path d="M142 80 L178 80 L270 140 L50 140 Z" fill="url(#rq-path)" />
      <path d="M150 80 L146 140 M170 80 L174 140" stroke="#fff" strokeWidth="1.4" strokeDasharray="5 6" opacity=".7" />
      <g fill="#2f8f46"><path d="M40 84 L52 52 L64 84 Z" /><path d="M262 84 L274 48 L286 84 Z" /><circle cx="22" cy="72" r="14" /><circle cx="300" cy="74" r="13" /></g>
      <g><rect x="127" y="90" width="66" height="7" rx="2" fill="#f4efe4" /><rect x="136" y="90" width="9" height="7" fill="#ff7a1a" /><rect x="154" y="90" width="9" height="7" fill="#ff7a1a" /><rect x="172" y="90" width="9" height="7" fill="#ff7a1a" /><rect x="127" y="90" width="5" height="18" fill="#f4efe4" /><rect x="188" y="90" width="5" height="18" fill="#f4efe4" /></g>
      <g>
        <ellipse cx="160" cy="132" rx="16" ry="4" fill="#000" opacity=".18" />
        <rect x="150" y="112" width="8" height="18" rx="4" fill="#334e8c" /><rect x="162" y="112" width="8" height="18" rx="4" fill="#334e8c" />
        <rect x="145" y="96" width="30" height="24" rx="10" fill="#1fb1a6" /><rect x="150" y="98" width="20" height="14" rx="4" fill="#ff8a3d" />
        <circle cx="160" cy="88" r="9" fill="#dba27a" /><path d="M151 86 a9 9 0 0 1 18 0 z" fill="#2c1d18" /><rect x="151" y="85" width="18" height="2.6" fill="#ffd23f" />
      </g>
    </svg>
  );
}
