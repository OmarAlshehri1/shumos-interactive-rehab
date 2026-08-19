/**
 * Card thumbnail — a warm safari scene with a happy monkey, a banana,
 * acacia trees, and a golden sky, deliberately NOT a garden, NOT
 * footprints, and NOT an underwater world (task section 2). Still (no
 * motion), same "professional library card, not the playful in-game feel"
 * reasoning as the other three thumbnails — no stock images, no emoji.
 */
export function FeedTheAnimalsThumbnail() {
  return (
    <div
      className="relative aspect-[16/7] w-full overflow-hidden rounded-t-2xl"
      style={{ background: "linear-gradient(150deg, #F7C873 0%, #F2A65C 55%, #C79A4E 100%)" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(60% 60% at 70% 0%, rgba(255,244,214,0.5) 0%, transparent 70%)" }} />

      {/* Distant hill. */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] opacity-60" style={{ background: "#8A6B3A", borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />

      {/* Acacia trees. */}
      <div className="absolute bottom-0 left-[4%]">
        <div className="mx-auto h-[26%] w-[6%] opacity-80" style={{ background: "#5A4126" }} />
        <div className="absolute -top-[10%] left-1/2 h-[16%] w-[38%] -translate-x-1/2 rounded-[50%_50%_45%_45%] opacity-85" style={{ background: "#3F6B2E" }} />
      </div>
      <div className="absolute right-[6%] bottom-0">
        <div className="mx-auto h-[20%] w-[5%] opacity-80" style={{ background: "#5A4126" }} />
        <div className="absolute -top-[8%] left-1/2 h-[12%] w-[30%] -translate-x-1/2 rounded-[50%_50%_45%_45%] opacity-85" style={{ background: "#4E8639" }} />
      </div>

      {/* The monkey — a friendly SVG face, not emoji. */}
      <svg viewBox="0 0 100 100" className="absolute bottom-[8%] left-[36%] h-[52%] w-[30%]">
        <circle cx="24" cy="34" r="12" fill="#8C5A3A" />
        <circle cx="76" cy="34" r="12" fill="#8C5A3A" />
        <circle cx="24" cy="34" r="6.5" fill="#C99B72" />
        <circle cx="76" cy="34" r="6.5" fill="#C99B72" />
        <circle cx="50" cy="42" r="28" fill="#8C5A3A" />
        <ellipse cx="50" cy="52" rx="18" ry="14" fill="#E8CBA6" />
        <circle cx="41" cy="42" r="4" fill="#3A2415" />
        <circle cx="59" cy="42" r="4" fill="#3A2415" />
        <path d="M40 58 Q50 65 60 58" stroke="#6B4226" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>

      {/* The banana. */}
      <svg viewBox="0 0 100 100" className="absolute right-[14%] bottom-[10%] h-[26%] w-[16%]">
        <path
          d="M30 78 C20 68 20 46 34 30 C42 21 54 16 64 15 C67 15 68 18 66 20 C56 24 46 30 40 40 C32 53 33 66 42 74 C44 76 43 80 40 80 C36 80 32 80 30 78 Z"
          fill="#F2C94C"
          stroke="#D9A62A"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
