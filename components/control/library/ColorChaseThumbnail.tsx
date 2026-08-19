export function ColorChaseThumbnail() {
  const colors = ["#38BDF8", "#FACC15", "#F43F5E", "#34D399", "#F472B6", "#A78BFA", "#22D3EE", "#FB7185", "#818CF8"];
  return (
    <div className="relative h-32 overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#263a72_0%,#111a3b_48%,#070b1e_100%)]">
      <div className="absolute inset-x-[17%] top-[13%] grid grid-cols-3 gap-2 [transform:perspective(240px)_rotateX(52deg)]">
        {colors.map((color, index) => (
          <span
            key={color}
            className="aspect-square rounded-xl border border-white/25"
            style={{ background: index === 4 ? color : `${color}35`, boxShadow: index === 4 ? `0 0 20px ${color}, inset 0 0 10px white` : "inset 0 0 9px rgba(255,255,255,.12)" }}
          />
        ))}
      </div>
      <svg viewBox="0 0 300 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M24 87 Q74 70 116 82 T205 76 T282 84" fill="none" stroke="rgba(129,140,248,.32)" strokeWidth="2" />
        <circle cx="150" cy="68" r="24" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
        <circle cx="150" cy="68" r="13" fill="rgba(255,255,255,.12)" />
      </svg>
    </div>
  );
}
