import type { AmbienceHandle } from "./ambience";

/** Sparse magical floor accents. Every source is a short one-shot; there is no loop, noise bed, hum, or hiss. */
export function startColorChaseAmbience(ctx: AudioContext, destination: AudioNode): AmbienceHandle {
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const schedule = (fn: () => void, delay: number) => {
    if (stopped) return;
    const timer = setTimeout(() => {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
      if (!stopped) fn();
    }, delay);
    timers.push(timer);
  };

  const shimmer = () => {
    const now = ctx.currentTime;
    [659.25, 987.77, 1318.51].forEach((frequency, index) => {
      const start = now + index * 0.13;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.15);
      oscillator.connect(gain).connect(destination);
      oscillator.start(start);
      oscillator.stop(start + 1.2);
    });
    schedule(shimmer, 10000 + Math.random() * 9000);
  };

  schedule(shimmer, 2500);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
    },
  };
}
