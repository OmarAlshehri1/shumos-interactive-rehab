import { BALLOON_COLOR_ORDER, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";
import type { DisplayEvent } from "@/components/display/events";
import { type AmbienceHandle, startAmbience } from "./ambience";
import { playCelebration, playChime, playOops, playPop } from "./effects";
// TEMPORARY TEST (paused Audar work — see the Task 10 checkpoint): swapped
// from "./audarLocalProvider"'s createAudarLocalVoiceProvider() to this. To
// revert, change this import back and swap the instantiation below.
import { createWebSpeechMariamProvider } from "./webSpeechMariamProvider";
import { DEFAULT_CHANNEL_VOLUMES, type ChannelVolumes, type VoicePriority } from "./types";
import { VoiceQueue } from "./voiceQueue";
import {
  allEncouragementLines,
  countdownLine,
  crossedEncouragementBand,
  encouragementLine,
  type EncouragementBand,
  incorrectLine,
  instructionLine,
  sessionCompleteLine,
  stageCompleteLine,
  startZoneFirstLine,
  startZoneReturnLine,
  welcomeLine,
} from "./voiceLines";

/** Minimum time between spoken "try again" lines, so a flurry of wrong guesses doesn't spam voice. */
const INCORRECT_SPEECH_COOLDOWN_MS = 4000;
/** How far ambience ducks (as a fraction of its normal level) while voice is speaking. */
const AMBIENCE_DUCK_FACTOR = 0.35;
const GAIN_RAMP_SECONDS = 0.35;

type WelcomeEvent = Extract<DisplayEvent, { type: "welcome" }>;

/**
 * The single place game/display events turn into sound. Nothing else in
 * the codebase talks to Web Audio directly — scenes only ever call
 * onEvent(); this class decides what, if anything, that should sound like.
 *
 * TASK 8.1 — THE CHILD-FACING VOICE IS THE ONLY VOICE: a real listening
 * test found the child hearing a robotic male browser voice mid-session.
 * The root cause (see the Task 8.1 report) was the OLD
 * fallback-to-SpeechSynthesis policy combined with a single provider
 * failure blacklisting it for 60s, cascading into the rest of the session.
 * Per that policy (still in force after Task 10's provider swap — see
 * below), this class speaks ONLY through the one configured voice
 * provider — never automatically to browser SpeechSynthesis. If it fails
 * for a CRITICAL line (instruction/countdown/stage-complete/session-complete),
 * speak() retries once; if that also fails, the game continues with only
 * the visible text/animation — silence, not a different voice. If it fails
 * for an OPTIONAL line (encouragement/incorrect), it's just skipped, no retry.
 *
 * TASK 10 — LOCAL AUDAR VOICE (demo_female_3): Munsit (a paid cloud API)
 * is retired. The single VoiceProvider below is now
 * createAudarLocalVoiceProvider() — a local, free, unlimited service
 * (tts-service/, started via `npm run tts`) using demo_female_3 ("female,
 * airy, dreamy") from AudarAI's open-licensed Audar-TTS-V1-Flash. Nothing
 * else in this class, VoiceQueue, or any scene component needed to
 * change — that's the entire point of the VoiceProvider abstraction. See
 * the Task 10 report for the full migration and how this differs from
 * Munsit operationally (no account/balance/rate-limit concept; failures
 * instead mean "the local service isn't running").
 *
 * Voice requests go through VoiceQueue, which enforces: instructions,
 * countdown, and stage/session-complete are "high" priority and may always
 * interrupt each other (so stale stage 1 speech can never bleed into stage
 * 2); encouragement is "normal" and never interrupts a high-priority line;
 * incorrect feedback is "low" and yields to everything.
 *
 * Every public method is safe to call at any time, in any browser: a
 * missing Web Audio API or a thrown error from the voice provider never
 * propagates out of this class. Gameplay must never depend on audio
 * succeeding.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private ambienceHandle: AmbienceHandle | null = null;
  // The ONLY voice. TEMPORARY TEST: using createWebSpeechMariamProvider()
  // (browser SpeechSynthesis locked to the installed "Mariam (Enhanced)"
  // voice only — see lib/audio/webSpeechMariamProvider.ts) while the local
  // Audar integration (createAudarLocalVoiceProvider(), Task 10) is paused.
  // This is still not a general SpeechSynthesis fallback — see the class
  // doc comment for why that's banned.
  private readonly voice = new VoiceQueue(createWebSpeechMariamProvider());

  private unlocked = false;
  private muted = false;
  private readonly volumes: ChannelVolumes = { ...DEFAULT_CHANNEL_VOLUMES };

  private pendingWelcomeEvent: WelcomeEvent | null = null;
  private childName: string | null = null;
  private lastIncorrectSpeechAt = 0;
  /** How many times each encouragement band has already been spoken this session — drives which pool variant plays next. */
  private readonly encouragementBandCounts: Partial<Record<EncouragementBand, number>> = {};

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
    if (muted) this.voice.cancel();
  }

  isSpeechAvailable(): boolean {
    return this.voice.isAvailable();
  }

  /**
   * Fire-and-forget cache warm-up for every voice line this session's
   * childName alone already makes predictable. Call once the child's name
   * is known (session creation) — nothing here needs to wait on which
   * stages actually get played.
   *
   * TASK 11: no longer takes a `stages` list. Before Task 11 every session
   * had exactly 3 fixed, pre-generated stages, so their target colors were
   * knowable up front. Now stages are generated lazily one at a time (see
   * lib/game/session.ts's class doc comment) and a session can move through
   * any subset of up to 5 stages per difficulty, across up to 3
   * difficulties — there is no fixed "this session's stages" list to read
   * colors/numbers from. Instead this warms EVERY line that could ever be
   * needed regardless of which stages get played: instructionLine for all 6
   * possible BalloonColors (BALLOON_COLOR_ORDER's full length — a stage's
   * target color is always one of these, however many stages actually run),
   * and stageCompleteLine for all 5 possible stage numbers (STAGES_PER_DIFFICULTY
   * — the phrase only depends on stageNumber + childName, never on
   * difficulty or color, so all 5 are safe to warm regardless of how many a
   * given session ends up playing).
   *
   * Ordered by the Task 8.1 spec's explicit priority — welcome and
   * instructions first (spoken soonest), then the 4 shared countdown words,
   * then stage-complete and session-complete, and OPTIONAL lines (incorrect,
   * encouragement) last — so a slow prefetch burst can never leave a
   * critical line still cold when its scene arrives, per "important speech
   * must jump ahead of optional speech."
   *
   * TASK 8.2: the two Start Zone lines are fixed (not personalized, not
   * per-stage — startZoneReturnLine is reused identically every time the
   * child returns between stages) and needed extremely early — Stage 1's
   * Start Zone appears before Stage 1's instruction even does — so they're
   * warmed right after the welcome line, ahead of any per-stage line.
   *
   * Purely a latency optimization: nothing here ever blocks gameplay, and
   * a line that wasn't prefetched (or whose prefetch failed) still works
   * normally on its next real speak() call.
   */
  prefetchForSession(childName: string): void {
    const lines = new Set<string>();
    lines.add(welcomeLine(childName));
    lines.add(startZoneFirstLine());
    lines.add(startZoneReturnLine());
    for (const color of BALLOON_COLOR_ORDER) lines.add(instructionLine(color));
    lines.add(countdownLine("3"));
    lines.add(countdownLine("2"));
    lines.add(countdownLine("1"));
    lines.add(countdownLine("start"));
    for (let stageNumber = 1; stageNumber <= STAGES_PER_DIFFICULTY; stageNumber++) {
      lines.add(stageCompleteLine(childName, stageNumber as StageNumber));
    }
    lines.add(sessionCompleteLine(childName));
    lines.add(incorrectLine());
    for (const line of allEncouragementLines(childName)) lines.add(line);

    void this.prefetchSequentially([...lines]);
  }

  /**
   * Dispatches prefetch requests strictly one at a time, awaiting each
   * request's completion before starting the next — never in parallel.
   * Originally forced by Munsit's "max 1 concurrent request" plan limit
   * (firing the ~20-line burst in parallel got 17/18 rejected with 429,
   * each falling back to SpeechSynthesis — exactly what this feature exists
   * to avoid). Kept after the Task 10 swap to createAudarLocalVoiceProvider()
   * because the local service's own generation lock (tts-service/server.py's
   * gen_lock) serializes real generation anyway — sending them one at a time
   * avoids piling up ~20 concurrent open HTTP requests against a single-GPU
   * local process, and if the very first request fails, the provider's
   * cooldown kicks in before the second one starts, skipping the rest of the
   * burst instead of each failing independently.
   */
  private async prefetchSequentially(lines: string[]): Promise<void> {
    for (const line of lines) {
      await this.voice.prefetch(line);
    }
  }

  /**
   * Must be called synchronously from within a real user gesture (click/
   * key handler) — browsers require that for both AudioContext and, on
   * some platforms, the first SpeechSynthesis call. Safe to call more than
   * once; only the first call does anything.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.ensureGraph();
    if (this.pendingWelcomeEvent) {
      const event = this.pendingWelcomeEvent;
      this.pendingWelcomeEvent = null;
      this.dispatch(event);
    }
  }

  handleEvent(event: DisplayEvent): void {
    if (!this.unlocked) {
      // WelcomeScene's mount fires "welcome" before any user gesture exists.
      // Remember it and replay it the moment unlock() actually happens.
      if (event.type === "welcome") this.pendingWelcomeEvent = event;
      return;
    }
    this.dispatch(event);
  }

  /** Cancels speech, stops ambience, closes the audio graph. Call on unmount / session reset. */
  destroy(): void {
    this.voice.cancel();
    this.ambienceHandle?.stop();
    this.ambienceHandle = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.ambienceGain = null;
    this.effectsGain = null;
    this.pendingWelcomeEvent = null;
  }

  private ensureGraph(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return; // Web Audio unavailable — effects/ambience stay silent, speech still works independently.

      const ctx = new AudioContextCtor();
      const masterGain = ctx.createGain();
      const ambienceGain = ctx.createGain();
      const effectsGain = ctx.createGain();

      ambienceGain.gain.value = this.volumes.ambience;
      effectsGain.gain.value = this.volumes.effects;
      ambienceGain.connect(masterGain);
      effectsGain.connect(masterGain);
      masterGain.connect(ctx.destination);
      masterGain.gain.value = this.muted ? 0 : this.volumes.master;

      this.ctx = ctx;
      this.masterGain = masterGain;
      this.ambienceGain = ambienceGain;
      this.effectsGain = effectsGain;
    } catch {
      // Leave everything null; every call site below already guards on this.ctx being present.
    }
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted ? 0 : this.volumes.master;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  private dispatch(event: DisplayEvent): void {
    switch (event.type) {
      case "welcome":
        this.childName = event.childName;
        this.startAmbienceIfNeeded();
        this.speak(welcomeLine(event.childName), "high");
        break;

      case "start_zone":
        this.speak(event.isFirstStage ? startZoneFirstLine() : startZoneReturnLine(), "high");
        break;

      case "instruction":
        this.speak(instructionLine(event.targetColor), "high");
        break;

      case "countdown_3":
      case "countdown_2":
      case "countdown_1":
      case "start":
        // Countdown speech is driven directly by CountdownScene through
        // speakCountdownTick() below, which the scene awaits to pace the
        // visual countdown against Lama's actual playback (Task 8.1) —
        // speaking it again here would double-speak every tick. These
        // events still fire (any future non-audio listener still sees
        // them), they just aren't what triggers speech anymore.
        break;

      case "balloon_pop":
        this.playEffect((ctx, dest) => playPop(ctx, dest));
        break;

      case "correct": {
        this.playEffect((ctx, dest) => playChime(ctx, dest));
        const band = crossedEncouragementBand(event.correctCount - 1, event.correctCount, event.totalTargets);
        if (band && this.childName) {
          const occurrenceIndex = this.encouragementBandCounts[band] ?? 0;
          const line = encouragementLine(band, this.childName, occurrenceIndex);
          const spoken = this.speak(line, "normal");
          if (spoken) this.encouragementBandCounts[band] = occurrenceIndex + 1;
        }
        break;
      }

      case "incorrect": {
        this.playEffect((ctx, dest) => playOops(ctx, dest));
        const now = Date.now();
        if (now - this.lastIncorrectSpeechAt > INCORRECT_SPEECH_COOLDOWN_MS) {
          this.lastIncorrectSpeechAt = now;
          this.speak(incorrectLine(), "low");
        }
        break;
      }

      case "stage_complete":
        this.playEffect((ctx, dest) => playCelebration(ctx, dest, `stage${event.stageNumber}`));
        this.speak(stageCompleteLine(event.childName, event.stageNumber), "high");
        break;

      case "session_complete":
        this.playEffect((ctx, dest) => playCelebration(ctx, dest, "session"));
        this.speak(sessionCompleteLine(event.childName), "high");
        break;

      case "ambience_start":
        this.startAmbienceIfNeeded();
        break;
      case "ambience_stop":
        this.stopAmbience();
        break;
    }
  }

  private playEffect(fn: (ctx: AudioContext, destination: AudioNode) => void): void {
    if (!this.ctx || !this.effectsGain) return;
    try {
      fn(this.ctx, this.effectsGain);
    } catch {
      // A synthesis glitch is cosmetic — never let it interrupt gameplay.
    }
  }

  private startAmbienceIfNeeded(): void {
    if (this.ambienceHandle || !this.ctx || !this.ambienceGain) return;
    try {
      this.ambienceHandle = startAmbience(this.ctx, this.ambienceGain);
    } catch {
      this.ambienceHandle = null;
    }
  }

  private stopAmbience(): void {
    this.ambienceHandle?.stop();
    this.ambienceHandle = null;
  }

  /** Returns whether the request was actually spoken (vs. dropped by VoiceQueue because something more important was speaking). */
  private speak(text: string, priority: VoicePriority, options?: { rate?: number }): boolean {
    if (this.muted || !text) return false;
    return this.speakWithRetry(text, priority, { rate: options?.rate });
  }

  /**
   * Speaks a countdown tick and resolves once it's actually settled — Lama
   * finished, Lama failed (after one retry) and playback was skipped, or
   * nothing was spoken at all (muted) — never once speech genuinely starts
   * and is still ongoing. CountdownScene awaits this to pace each tick
   * against real playback instead of a blind fixed timer, racing it against
   * its own safety timeout so a stalled network response can never freeze
   * the countdown (see components/display/scenes/CountdownScene.tsx).
   */
  speakCountdownTick(tick: "3" | "2" | "1" | "start"): Promise<void> {
    const text = countdownLine(tick);
    return new Promise<void>((resolve) => {
      if (this.muted || !text) {
        resolve();
        return;
      }
      let resolved = false;
      const settle = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      const spoken = this.speakWithRetry(text, "high", { rate: 1.05, onSettled: settle });
      if (!spoken) settle(); // dropped by the priority gate — never hang the countdown waiting for it
    });
  }

  /**
   * Speaks with the Task 8.1 CRITICAL-line retry policy: a "high" priority
   * request that fails (Lama errors — see munsitProvider.ts's onError) gets
   * exactly one automatic retry; if that also fails, playback is simply
   * skipped and the visible text/animation carries the moment alone. Never
   * retries "normal"/"low" (optional) lines — an optional line that fails
   * is just dropped, per policy. `onSettled` (if given) fires exactly once,
   * once the (possibly-retried) attempt has fully finished either way.
   */
  private speakWithRetry(text: string, priority: VoicePriority, options: { rate?: number; onSettled?: () => void }): boolean {
    this.duckAmbience();
    let attemptId = 0;
    const attempt = (isRetry: boolean): boolean => {
      const myAttempt = ++attemptId;
      return this.voice.request(text, priority, {
        rate: options.rate,
        volume: this.volumes.voice,
        onEnd: () => {
          if (myAttempt !== attemptId) return; // superseded by a retry — that attempt's own onEnd will settle instead
          this.restoreAmbience();
          options.onSettled?.();
        },
        onError: () => {
          if (myAttempt !== attemptId) return;
          if (priority === "high" && !isRetry) attempt(true);
        },
      });
    };
    return attempt(false);
  }

  private duckAmbience(): void {
    if (!this.ctx || !this.ambienceGain) return;
    const target = this.volumes.ambience * AMBIENCE_DUCK_FACTOR;
    this.ambienceGain.gain.setTargetAtTime(target, this.ctx.currentTime, GAIN_RAMP_SECONDS);
  }

  private restoreAmbience(): void {
    if (!this.ctx || !this.ambienceGain) return;
    this.ambienceGain.gain.setTargetAtTime(this.volumes.ambience, this.ctx.currentTime, GAIN_RAMP_SECONDS);
  }
}
