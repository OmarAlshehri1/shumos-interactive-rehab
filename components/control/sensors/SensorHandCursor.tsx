import type { NormalizedPointerPosition } from "@/lib/physicalInput";

/** Must match the rendered box's actual size below (h-16 w-16 = 64px) — see the component doc comment's visibility-inset explanation. */
const HAND_DIAMETER_PX = 64;
const HAND_RADIUS_PX = HAND_DIAMETER_PX / 2;

/**
 * The one consistent virtual hand/pointer across every sensor-compatible
 * game (Part "VIRTUAL HAND / POINTER"): same look, same size, smooth at
 * 50Hz (a plain CSS `left`/`top` percentage each render — no per-frame
 * animation loop to fall behind), and automatically absent whenever there
 * is nothing to show (caller passes `visible={connected && !!pointer}`),
 * so a disconnect never leaves a stale hand frozen on screen.
 *
 * NEVER-LOSE-THE-HAND: `pointer.x`/`pointer.y` are already guaranteed in
 * [0,1] by ContinuousMotionController's saturating integrator + output
 * clamp (see its class doc comment) — there is no separate/hidden internal
 * position for Control and Display to disagree about; both render this
 * exact same component from that one canonical NormalizedPointerPosition
 * (Display via SensorPointerDisplaySync's mirrored value, Control via
 * SensorHandLayer). What THIS component additionally guarantees is that the
 * full 64px hand stays visually inside its container even at x/y = 0 or 1:
 * mapping [0,1] directly to `left`/`top` percentages (the previous
 * behavior) put the pointer's CENTER at the exact edge, so half the
 * rendered hand hung off-screen — a plain edge clamp on the center is not
 * enough once the cursor has a visible radius. Insetting the mapped range
 * by one radius on each side (radius..100%-radius) keeps the whole circle
 * inside the container at every reachable position, using the container's
 * own live width/height (each axis's own `100%`) rather than a hardcoded
 * game size, so this holds for every compatible game's own map/stage
 * dimensions without per-game configuration.
 *
 * TRANSITION DURATION: 45ms, not the original 75ms. CONTROL-ONLY as of the
 * DISPLAY PERFORMANCE FIX below: Control's local pointer arrives effectively
 * every sample (up to 50Hz/20ms), where ANY transition is pure added lag
 * with nothing to bridge — 45ms is what's left of an already-short value
 * once the original 75ms was measured against an 11Hz/90ms throttle that no
 * longer exists anywhere in this pipeline. Preserved exactly, unchanged, so
 * Control's already-good feel never moves. Display used to share this exact
 * path (retargeting this same fixed transition on every ~20Hz Firebase
 * hop), but a fixed CSS transition can only ever be tuned against a NOMINAL
 * throttle interval, not actual (network-jittery) delivery spacing — see
 * useInterpolatedPointer.ts, which now drives Display's render via `instant`
 * below instead. Controller processing itself is sub-millisecond (see
 * tools/witmotion_ble/real_dataset/final_session_cross_coupling_report.json's
 * latency_stages_ms) — this transition was the visible, measurable, safe-
 * to-shorten stage on top of it.
 *
 * `instant`: Display no longer feeds this component the raw Firebase-mirrored
 * pointer directly — it pre-smooths it every animation frame via
 * useInterpolatedPointer (see DisplayScreen.tsx), so a CSS transition on top
 * would just double-smooth (chasing an already-eased value) and add lag back
 * in. Control passes no `instant` prop at all, so its rendering is byte-for-
 * byte unchanged from before this existed.
 */
export function SensorHandCursor({
  pointer,
  visible,
  instant,
  handRole,
}: {
  pointer: NormalizedPointerPosition | null;
  visible: boolean;
  instant?: boolean;
  /**
   * Optional dual-hand visual differentiation (tonight's dual-sensor
   * brief, section 12) — omitted (the default) renders BYTE-IDENTICAL
   * markup to before this prop existed, so every existing single-hand
   * caller is completely unaffected. When both hands are ever shown at
   * once, "LEFT_HAND" gets a distinct color AND a mirrored icon AND a
   * small "ي"/"د" badge — never color alone, so this stays legible for a
   * colorblind viewer too. Not enabled by any production game yet.
   */
  handRole?: "RIGHT_HAND" | "LEFT_HAND";
}) {
  if (!visible || !pointer) return null;
  const isLeft = handRole === "LEFT_HAND";
  const wrapperClassName = [
    "pointer-events-none absolute z-30 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white",
    isLeft ? "bg-violet-500/75" : "bg-teal-500/75",
    "shadow-xl",
    instant ? null : "transition-[left,top] duration-[45ms] ease-linear",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={wrapperClassName}
      style={{
        left: `calc(${HAND_RADIUS_PX}px + ${pointer.x} * (100% - ${HAND_DIAMETER_PX}px))`,
        top: `calc(${HAND_RADIUS_PX}px + ${pointer.y} * (100% - ${HAND_DIAMETER_PX}px))`,
      }}
      aria-hidden="true"
    >
      <span className={`flex h-full w-full items-center justify-center text-3xl ${isLeft ? "-scale-x-100" : ""}`}>✋</span>
      {handRole && (
        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-slate-900 text-[10px] font-black text-white">
          {isLeft ? "ي" : "م"}
        </span>
      )}
    </div>
  );
}
