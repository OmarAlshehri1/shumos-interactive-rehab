interface MuteToggleProps {
  muted: boolean;
  onToggle: () => void;
}

/**
 * TASK 4 TEMPORARY TESTING CONTROL. Small and unobtrusive on purpose — the
 * therapist will eventually control audio from /control, at which point
 * this can be removed. Deliberately not production-gated like DevBadge:
 * muting is real functionality someone testing the experience needs, not
 * just a debug label.
 */
export function MuteToggle({ muted, onToggle }: MuteToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
      aria-pressed={muted}
      className="absolute bottom-3 right-3 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/40"
    >
      {muted ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M16.5 12c0-1.77-.77-3.29-2-4.34v2.05l2 2v.29zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-.77-3.29-2-4.34v8.68c1.23-1.05 2-2.57 2-4.34zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      )}
    </button>
  );
}
