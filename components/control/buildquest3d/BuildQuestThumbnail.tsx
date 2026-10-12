/** Lightweight library artwork; the game itself uses real Three.js geometry. */
export function BuildQuestThumbnail() {
  return (
    <div
      className="relative h-36 overflow-hidden bg-[#e3ede5]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 320 150" className="h-full w-full">
        <ellipse cx="162" cy="125" rx="110" ry="12" fill="#456a5920" />
        <path d="M45 80 248 66 283 96 80 115Z" fill="#d9bc8d" />
        <path d="M80 115 283 96 283 105 80 124Z" fill="#b79b73" />
        <path d="M83 124v15M263 107v27" stroke="#53786a" strokeWidth="6" />
        <path d="m96 52 61-5 18 14-61 6Z" fill="#f2aa91" />
        <path d="M96 52v45l18 15V67Z" fill="#d68166" />
        <path d="m114 67 61-6v46l-61 5Z" fill="#ee987b" />
        <path d="m90 54 43-36 44 37Z" fill="#78ada6" />
        <rect x="133" y="80" width="18" height="30" rx="3" fill="#54766e" />
        <rect x="151" y="71" width="14" height="13" rx="2" fill="#f6e4b9" />
        <path d="m207 78 24-3 11 10-24 3Z" fill="#dcc173" />
        <path d="M207 78v23l11 10V88Z" fill="#cba65c" />
        <path d="m218 88 24-3v22l-24 4Z" fill="#e8c570" />
        <circle cx="266" cy="61" r="11" fill="#a7bb9b" />
        <circle cx="64" cy="49" r="6" fill="#ceac78" />
      </svg>
    </div>
  );
}
