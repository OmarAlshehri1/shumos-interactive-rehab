/**
 * TASK 9 PART 4 — the canonical internal play surface.
 *
 * The approved engine already generates every balloon/Start Zone position
 * as normalized [0,1] coordinates (see lib/game/stageGenerator.ts,
 * lib/game/startZone.ts) specifically so the visual layer never has to
 * care about physical pixels. Every scene component already positions its
 * content as a percentage of "the nearest positioned ancestor filling the
 * space" (e.g. Balloon.tsx's `left: x*100%`) — that ancestor used to be
 * `<main>` itself, i.e. the raw browser viewport, whatever aspect ratio it
 * happened to be. On a non-16:9 window (an ultra-wide monitor, a 4:3
 * projector, a resized browser) that let the normalized coordinate space
 * silently stretch into a different shape than it was designed for.
 *
 * PlayStage fixes that by becoming the new "nearest positioned ancestor"
 * instead: a centered box that always maintains a 16:9 aspect ratio (the
 * ratio every listed target resolution — 1920x1080, 1280x720, 1366x768,
 * 2560x1440 — already is, and the ratio the balloon/Start Zone geometry was
 * tuned against), sized as the largest 16:9 rectangle that fits inside the
 * real viewport. On a taller/narrower window (16:10, 4:3) this pillarboxes
 * gracefully; DisplayScreen renders <Environment /> OUTSIDE this box, at
 * full viewport size, so the unused margin shows more sky/hills — never an
 * empty black bar. No scene component needed to change: every one of them
 * already renders `absolute inset-0`/percentage-based content relative to
 * its parent, so simply changing what that parent's box actually IS is
 * enough. `overflow-hidden` keeps anything computed slightly out-of-bounds
 * (e.g. a rounding edge case) from ever bleeding onto the letterbox
 * background.
 *
 * This box's own dimensions are pure CSS (no JS resize listener, no
 * measured state) — the browser recomputes it on every reflow for free,
 * including a live window resize. Nothing about the game's own state
 * (balloon ids, positions, popped flags, score) is touched by any of
 * this — see the Task 9 report's "resize handling" section.
 */
const GAME_ASPECT_RATIO = 16 / 9;

export function PlayStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="relative overflow-hidden"
        style={{
          width: `min(100dvw, calc(100dvh * ${GAME_ASPECT_RATIO}))`,
          height: `min(100dvh, calc(100dvw / ${GAME_ASPECT_RATIO}))`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
