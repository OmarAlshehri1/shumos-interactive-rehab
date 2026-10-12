import { Difficulty, TOTAL_STARS } from "@/lib/spacepilot";
import type { GameId } from "@/lib/games/registry";
import type { DisplayEvent } from "@/components/display/events";
import { type AmbienceHandle, startAmbience } from "./ambience";
import { startCosmicAmbience } from "./cosmicAmbience";
import { startUnderwaterAmbience } from "./underwaterAmbience";
import { startSpaceAmbience } from "./spaceAmbience";
import { startColorChaseAmbience } from "./colorChaseAmbience";
import { playColorCelebration, playColorCorrect, playColorDanger, playColorPadActivation, playColorWrong } from "./colorChaseEffects";
import {
  colorChaseDangerLine,
  colorChaseIncorrectLine,
  colorChaseInstructionLine,
  colorChaseReadyLine,
  colorChaseSessionCompleteLine,
  colorChaseStageCompleteLine,
  colorChaseTargetLine,
  colorChaseWelcomeLine,
} from "./colorChaseVoiceLines";
import { playApplause, playCelebration, playChime, playOops, playPop } from "./effects";
import {
  playCheckpointChime,
  playCometSweepEffect,
  playCosmicCelebration,
  playCosmicIntroChime,
  playFootstepChime,
  playFootstepsChordResolve,
  playMeteorBreakEffect,
  playRockDissolveEffect,
} from "./cosmicEffects";
import { playBubbleIncorrect, playBubblePop, playUnderwaterCelebration, playUnderwaterIntroSting } from "./underwaterEffects";
import {
  footstepsCheckpointLine,
  footstepsInstructionLine,
  footstepsMilestoneLine,
  footstepsObstacleActiveLine,
  footstepsObstacleClearedLine,
  footstepsSessionCompleteLine,
  footstepsStageCompleteLine,
  footstepsWelcomeLine,
} from "./footstepsVoiceLines";
import { RouteObstacleKind } from "@/lib/footsteps";
import {
  bubblePopIncorrectLine,
  bubblePopInstructionLine,
  bubblePopMilestoneLine,
  bubblePopReadyPositionLine,
  bubblePopSequenceRequestLine,
  bubblePopSessionCompleteLine,
  bubblePopStageCompleteLine,
  bubblePopTargetRequestLine,
  bubblePopWelcomeLine,
} from "./bubblePopVoiceLines";
import {
  spacePilotAdvancedInstructionLine,
  spacePilotFinalStarLine,
  spacePilotInstructionLine,
  spacePilotMediumInstructionLine,
  spacePilotMilestoneLine,
  spacePilotReadyPositionLine,
  spacePilotSessionCompleteLine,
  spacePilotStageCompleteLine,
  spacePilotWelcomeLine,
} from "./spacePilotVoiceLines";
import {
  playAlienPassSound,
  playAsteroidClearSound,
  playFinalStarChord,
  playFireSound,
  playLaneChangeSound,
  playPortalSound,
  playRocketUpgradeSound,
  playSpaceCelebration,
  playSpaceIntroSting,
  playStarCollectChime,
  playStarMissSound,
} from "./spaceEffects";
import { createMunsitVoiceProvider } from "./munsitProvider";
import type { VoiceProvider } from "./speech";
import { DEFAULT_CHANNEL_VOLUMES, type ChannelVolumes, type VoicePriority } from "./types";
import { VoiceQueue } from "./voiceQueue";
import {
  countdownLine,
  crossedEncouragementBand,
  encouragementLine,
  type EncouragementBand,
  incorrectLine,
  instructionLine,
  pausedLine,
  sessionCompleteLine,
  stageCompleteLine,
  startZoneFirstLine,
  startZoneReturnLine,
  waitingWorldGreetingLine,
  welcomeLine,
} from "./voiceLines";

/** Minimum time between spoken "try again" lines, so a flurry of wrong guesses doesn't spam voice. */
const INCORRECT_SPEECH_COOLDOWN_MS = 4000;
/** How far ambience ducks (as a fraction of its normal level) while voice is speaking. */
const AMBIENCE_DUCK_FACTOR = 0.35;
const GAIN_RAMP_SECONDS = 0.35;

type CountdownTick = "3" | "2" | "1" | "start";

type PendingSpeech =
  | { kind: "event"; event: DisplayEvent }
  | { kind: "countdown"; tick: CountdownTick; requestedAt: number };

/** A countdown word is useful only while that visual moment is still current. */
const PENDING_COUNTDOWN_MAX_AGE_MS = 3000;

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
 * Per that policy (still in force), this class speaks ONLY through the one
 * configured voice provider — never automatically to browser
 * SpeechSynthesis. If it fails for a CRITICAL line (instruction/countdown/
 * stage-complete/session-complete), speak() retries once; if that also
 * fails, the game continues with only the visible text/animation —
 * silence, not a different voice. If it fails for an OPTIONAL line
 * (encouragement/incorrect), it's just skipped, no retry.
 *
 * PRE-DEMO AUDIO FIX — MUNSIT IS ACTIVE AGAIN: the single VoiceProvider
 * below is createMunsitVoiceProvider() — Munsit's "Lama" (Saudi Hijazi
 * female), via our own server-side app/api/tts/route.ts proxy (see that
 * file's doc comment for the real Munsit HTTP contract). The Task 10 local
 * Audar detour and the brief createWebSpeechMariamProvider() A/B test are
 * both retired; neither is imported anywhere anymore. Munsit has a real
 * account/balance/rate-limit — see munsitProvider.ts's cooldown policy for
 * exactly how a quota/rate-limit failure degrades to silence without
 * retry-storming the API or ever substituting a different voice.
 *
 * Voice requests go through VoiceQueue. HIGH instructions are serialized
 * with one latest-only pending slot so a paid in-flight synthesis is heard,
 * while stale not-yet-started speech cannot become a backlog. Session/game
 * boundaries explicitly cancel that slot. Encouragement is "normal" and
 * incorrect feedback is "low"; both yield to child guidance.
 *
 * Every public method is safe to call at any time, in any browser: a
 * missing Web Audio API or a thrown error from the voice provider never
 * propagates out of this class. Gameplay must never depend on audio
 * succeeding.
 */

/**
 * CREDIT OPTIMIZATION — ROUND 2 (the gameId-scoping in round 1 was not
 * enough: Bubble Pop Wall alone still bought 110 real lines just from a
 * session appearing). Every OTHER line in the app now synthesizes strictly
 * ON DEMAND, the instant it's actually about to be spoken (see
 * AudioManager.speak()/speakWithRetry() — completely unchanged by this
 * file: cache miss -> exactly one live Munsit request -> cache -> play,
 * same as it always was). Prefetch's only remaining job is shaving fetch
 * latency off the tiny handful of lines that are genuinely certain to be
 * needed within the first few seconds of a session, for EVERY game, EVERY
 * time: the game's own welcome line (spoken as soon as audio unlocks) and
 * the 4 fixed countdown words (COUNTDOWN is a state every session passes
 * through, shared verbatim across all five games via CountdownScene/
 * speakCountdownTick — see countdownLine() below). That is the entire
 * list: no colors, no shapes, no animals, no stage numbers, no
 * encouragement/milestone pools, no combinatorial matrices. Removing a line
 * from THIS list never removes its voice coverage — every dispatch() case
 * below still calls the real line-builder function and still speaks it;
 * only the ahead-of-time cache warm-up is gone for anything speculative.
 * See lib/audio/__tests__/prefetchLines.test.ts.
 */
const COUNTDOWN_PREFETCH_LINES: readonly string[] = [countdownLine("3"), countdownLine("2"), countdownLine("1"), countdownLine("start")];

function buildBalloonQuestPrefetchLines(childName: string): string[] {
  return [welcomeLine(childName), ...COUNTDOWN_PREFETCH_LINES];
}

function buildFootstepsPrefetchLines(childName: string): string[] {
  return [footstepsWelcomeLine(childName), ...COUNTDOWN_PREFETCH_LINES];
}

function buildBubblePopPrefetchLines(childName: string): string[] {
  return [bubblePopWelcomeLine(childName), ...COUNTDOWN_PREFETCH_LINES];
}

function buildSpacePilotPrefetchLines(childName: string): string[] {
  return [spacePilotWelcomeLine(childName), ...COUNTDOWN_PREFETCH_LINES];
}

function buildColorChasePrefetchLines(childName: string): string[] {
  return [colorChaseWelcomeLine(childName), ...COUNTDOWN_PREFETCH_LINES];
}

/**
 * Resolves the ONE registered game's own tiny prefetch list for `gameId` —
 * never any other game's, and never more than 5 lines (welcome + the 4
 * shared countdown words). Exported for direct unit testing (no DOM/network
 * needed) — see lib/audio/__tests__/prefetchLines.test.ts.
 */
export function buildPrefetchLines(gameId: GameId, childName: string): string[] {
  switch (gameId) {
    case "balloon-quest":
      return buildBalloonQuestPrefetchLines(childName);
    case "follow-the-footsteps":
      return buildFootstepsPrefetchLines(childName);
    case "bubble-pop-wall":
      return buildBubblePopPrefetchLines(childName);
    case "space-pilot":
      return buildSpacePilotPrefetchLines(childName);
    case "color-chase":
      return buildColorChasePrefetchLines(childName);
    case "harvest-valley-3d":
    case "blooming-world-3d":
    case "fire-rescue-3d":
    case "pearl-voyage-3d":
    case "runner-quest-3d":
    case "mirror-quest-3d":
    case "safe-hex-arena-3d":
    case "turn-and-go-3d":
    case "build-quest-3d":
      return []; // These games never request paid TTS.
    default:
      return []; // Unknown or retired runtime IDs cannot prefetch audio.
  }
}

export interface AudioReadiness {
  ready: boolean;
  contextState: string;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private ambienceHandle: AmbienceHandle | null = null;
  /** Follow the Footsteps' own cosmic ambience — kept as a SEPARATE handle from ambienceHandle above so each game's ambience machinery is independently start/stop-able; only one is ever actually running at a time since only one game display mounts per session. */
  private cosmicAmbienceHandle: AmbienceHandle | null = null;
  /** Bubble Pop Wall's own underwater ambience — same independent-handle story as cosmicAmbienceHandle above. */
  private underwaterAmbienceHandle: AmbienceHandle | null = null;
  /** Space Pilot's own deep-space ambience — same independent-handle story as the other game ambience handles above. */
  private spaceAmbienceHandle: AmbienceHandle | null = null;
  /** Color Chase's sparse magical accents; never a continuous tone or noise layer. */
  private colorChaseAmbienceHandle: AmbienceHandle | null = null;
  // The ONLY voice — Munsit's "Lama" (Saudi Hijazi female), via our own
  // server-side /api/tts proxy (see app/api/tts/route.ts and
  // munsitProvider.ts). Never falls back to browser SpeechSynthesis or any
  // other voice — see the class doc comment for why that's banned; a
  // Munsit failure (quota exhausted, rate-limited, unreachable) means this
  // one line stays silent, visible text/animation carries the moment, and
  // the game continues.
  private readonly voice: VoiceQueue;

  private unlocked = false;
  private muted = false;
  private readonly volumes: ChannelVolumes = { ...DEFAULT_CHANNEL_VOLUMES };

  /**
   * `voiceProvider` is injectable ONLY for unit testing (see
   * lib/audio/__tests__/AudioManager.test.ts) — every real call site
   * (lib/audio/useAudioManager.ts) constructs `new AudioManager()` with no
   * argument, which behaves EXACTLY as before (createMunsitVoiceProvider(),
   * unchanged Munsit contract). This is the only way to assert dispatch()
   * still speaks the right line for the right event, across all five
   * games, without a live network call or a jsdom/Web-Audio environment.
   */
  constructor(
    voiceProvider: VoiceProvider = createMunsitVoiceProvider(),
    private readonly onReadinessChange: (readiness: AudioReadiness) => void = () => {},
  ) {
    this.voice = new VoiceQueue(voiceProvider);
  }

  /**
   * Latest still-relevant high-priority line emitted before the browser has
   * granted audio playback. This is deliberately one slot, not a backlog:
   * a newer scene replaces the old scene's instruction.
   */
  private pendingSpeech: PendingSpeech | null = null;
  /** The world whose ambience should be active; null means the waiting/garden world. */
  private activeGameId: GameId | null | undefined;
  private childName: string | null = null;
  private lastIncorrectSpeechAt = 0;
  /** Same incorrect-speech cooldown as lastIncorrectSpeechAt above, tracked separately for Bubble Pop Wall so a flurry of wrong balloon taps in one game session never suppresses a genuinely fresh incorrect bubble tap in another (not that both ever run at once, but keeping the two games' cooldowns structurally independent avoids any accidental coupling). */
  private lastBubblePopIncorrectSpeechAt = 0;
  /** How many times each encouragement band has already been spoken this session — drives which pool variant plays next. */
  private readonly encouragementBandCounts: Partial<Record<EncouragementBand, number>> = {};
  /** How many times a Follow the Footsteps milestone line has already been spoken this session — drives which pool variant plays next, same cycling convention as encouragementBandCounts above. */
  private footstepsMilestoneCount = 0;
  /** JOURNEY REDESIGN — same cycling convention as footstepsMilestoneCount above, for the checkpoint-reached line pool. */
  private footstepsCheckpointCount = 0;
  /** Same cycling convention as footstepsMilestoneCount above, for Bubble Pop Wall's own milestone pool. */
  private bubblePopMilestoneCount = 0;
  /** Same cycling convention as footstepsMilestoneCount above, for Space Pilot's own milestone pool. */
  private spacePilotMilestoneCount = 0;
  /** Number of accepted speech groups that have not settled yet. */
  private activeSpeechDucks = 0;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
    if (muted) {
      this.voice.cancel();
      // Providers do not all emit onEnd when cancel() pauses a media
      // element. VoiceQueue settles callbacks, and this explicit reset is a
      // final guard against ambience remaining ducked after mute/cancel.
      this.activeSpeechDucks = 0;
      this.applyAmbienceDucking();
    } else {
      this.ensureGraph();
    }
    this.notifyReadiness();
  }

  isSpeechAvailable(): boolean {
    return this.voice.isAvailable();
  }

  /**
   * Fire-and-forget cache warm-up for every voice line THIS SESSION'S GAME
   * (and only this game) makes predictable from childName alone. Call once
   * both the child's name AND the game are known (a canonical session has
   * appeared) — nothing here needs to wait on which stages actually get
   * played.
   *
   * COST INCIDENT — REAL MUNSIT CREDITS: this used to unconditionally warm
   * ALL FIVE registered games' full predictable-line libraries on every
   * single call, regardless of which game the session was actually for —
   * "harmless, the cache absorbs the redundancy" was true for latency but
   * false for cost: nothing here is free, every distinct string is a real
   * paid Munsit request the very first time any fresh tab (a new /display
   * load, or the same tab after a reload) sees a given sessionId, since the
   * client-side cache (munsitProvider.ts) is in-memory and per-tab, not
   * pre-warmed. At 5 games — Bubble Pop Wall's own color x shape x
   * sequence-pair matrix alone is over 90 distinct strings — that added up
   * to ~200 real synthesis calls per fresh session, most for games that
   * were never even opened. Now scoped to exactly the active `gameId` via
   * buildPrefetchLines() above; each game's own list is unchanged from
   * before, only the "warm the other four too" behavior is gone. See
   * lib/audio/__tests__/prefetchLines.test.ts.
   *
   * Ordered by actual use: the welcome first, then the 4 shared countdown
   * words. There are no optional or speculative lines in this list.
   *
   * Purely a latency optimization: nothing here ever blocks gameplay, and
   * a line that wasn't prefetched (or whose prefetch failed) still works
   * normally on its next real speak() call.
   */
  prefetchForSession(childName: string, gameId: GameId): void {
    void this.prefetchSequentially(buildPrefetchLines(gameId, childName));
  }

  /**
   * Dispatches prefetch requests strictly one at a time, awaiting each
   * request's completion before starting the next — never in parallel.
   * Forced by Munsit's "max 1 concurrent request" plan limit — even a
   * small parallel burst can be rejected with 429, wasting quota
   * on requests that were always going to fail. Sequential also means if
   * the very first request fails outright, the provider's cooldown kicks in
   * before the second one starts, skipping the rest of the burst instead of
   * each failing independently and spamming the API.
   */
  private async prefetchSequentially(lines: string[]): Promise<void> {
    for (const line of lines) {
      await this.voice.prefetch(line);
    }
  }

  /**
   * Must be called synchronously from within a real user gesture (click/
   * key handler), as required by browser autoplay policy. Safe and useful
   * to call repeatedly: speech is flushed once, while every gesture retries
   * a suspended AudioContext.
   */
  unlock(): void {
    const wasUnlocked = this.unlocked;
    this.unlocked = true;
    this.ensureGraph();
    // This is the material part of OFF -> ON that made a silent display
    // audible again: it writes the intended value onto the already-created
    // master bus. Do the same on the very first unlock (and every recovery
    // unlock) so the icon's audible state never depends on a later toggle.
    this.applyMasterGain();

    // unlock() is intentionally retryable. A newly-created AudioContext is
    // allowed to start suspended, and resume() can be rejected if a browser
    // decides the first event did not carry activation. Every later genuine
    // pointer/key gesture gets another synchronous resume attempt.
    if (this.activeGameId !== undefined) this.startActiveAmbience();

    if (!wasUnlocked && this.pendingSpeech) {
      const pending = this.pendingSpeech;
      this.pendingSpeech = null;
      if (pending.kind === "event") {
        this.dispatch(pending.event);
      } else if (Date.now() - pending.requestedAt <= PENDING_COUNTDOWN_MAX_AGE_MS) {
        void this.speakCountdownTick(pending.tick);
      }
    }
    this.notifyReadiness();
  }

  /**
   * Best-effort remote recovery. Unlike unlock(), this does not claim
   * success until Chrome itself reports the display AudioContext running.
   * A Firebase callback is not a user gesture, so default Chrome commonly
   * leaves the context suspended; that result is returned verbatim for the
   * display to acknowledge back to /control.
   */
  async attemptRemoteEnable(): Promise<AudioReadiness> {
    this.muted = false;
    const ctx = this.ensureGraph(false);
    this.applyMasterGain();
    if (!ctx) {
      this.notifyReadiness();
      return this.getReadiness();
    }

    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        // The state below is the authoritative result; autoplay rejection
        // must remain a visible blocked acknowledgement, never an exception
        // that the control UI mistakes for success.
      }
    }

    if (ctx.state === "running") {
      const wasUnlocked = this.unlocked;
      this.unlocked = true;
      this.applyMasterGain();
      if (this.activeGameId !== undefined) this.startActiveAmbience();
      if (!wasUnlocked && this.pendingSpeech) {
        const pending = this.pendingSpeech;
        this.pendingSpeech = null;
        if (pending.kind === "event") {
          this.dispatch(pending.event);
        } else if (Date.now() - pending.requestedAt <= PENDING_COUNTDOWN_MAX_AGE_MS) {
          void this.speakCountdownTick(pending.tick);
        }
      }
    }

    this.notifyReadiness();
    return this.getReadiness();
  }

  getReadiness(): AudioReadiness {
    const contextState = this.ctx?.state ?? "unavailable";
    return {
      ready: this.unlocked && !this.muted && contextState === "running",
      contextState,
    };
  }

  handleEvent(event: DisplayEvent): void {
    if (!this.unlocked) {
      this.captureBeforeUnlock(event);
      return;
    }
    this.dispatch(event);
  }

  /**
   * Synchronizes the persistent display's ambience with the active game.
   * This is also what makes a refresh directly into START_ZONE/COUNTDOWN/
   * PLAYING start the correct ambience even though no WelcomeScene mounts.
   * `null` selects the shared waiting-world garden ambience.
   */
  setActiveGame(gameId: GameId | null): void {
    const changed = this.activeGameId !== undefined && this.activeGameId !== gameId;
    this.activeGameId = gameId;
    if (changed) {
      this.voice.cancel();
      this.activeSpeechDucks = 0;
      this.applyAmbienceDucking();
      this.pendingSpeech = null;
    }
    if (this.unlocked) {
      this.ensureGraph();
      this.startActiveAmbience();
    }
  }

  /** Cancels speech, stops ambience, closes the audio graph. Call on unmount / session reset. */
  destroy(): void {
    this.voice.cancel();
    this.ambienceHandle?.stop();
    this.cosmicAmbienceHandle?.stop();
    this.underwaterAmbienceHandle?.stop();
    this.spaceAmbienceHandle?.stop();
    this.colorChaseAmbienceHandle?.stop();
    this.ambienceHandle = null;
    this.cosmicAmbienceHandle = null;
    this.underwaterAmbienceHandle = null;
    this.spaceAmbienceHandle = null;
    this.colorChaseAmbienceHandle = null;
    if (this.ctx) {
      this.ctx.onstatechange = null;
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.ambienceGain = null;
    this.effectsGain = null;
    this.pendingSpeech = null;
    this.activeGameId = undefined;
    this.activeSpeechDucks = 0;
  }

  private ensureGraph(autoResume = true): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state !== "closed") {
        if (autoResume && this.ctx.state !== "running") this.resumeGraph(this.ctx);
        return this.ctx;
      }
      this.ctx = null;
      this.masterGain = null;
      this.ambienceGain = null;
      this.effectsGain = null;
    }
    try {
      const AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null; // Web Audio unavailable — effects/ambience stay silent, speech still works independently.

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
      ctx.onstatechange = () => this.notifyReadiness();
      this.masterGain = masterGain;
      this.ambienceGain = ambienceGain;
      this.effectsGain = effectsGain;
      // AudioContext may still start suspended even when created from the
      // display's unlock gesture. Resume it immediately so ambience/SFX are
      // available from the first interaction.
      if (autoResume && ctx.state !== "running") this.resumeGraph(ctx);
      return ctx;
    } catch {
      // Leave everything null; every call site below already guards on this.ctx being present.
      return null;
    }
  }

  private resumeGraph(ctx: AudioContext): void {
    void ctx
      .resume()
      .then(() => {
        if (this.ctx !== ctx || ctx.state !== "running") return;
        // Fullscreen entry can suspend/interrupt Web Audio after the click's
        // first resume. Re-assert the complete audible state only after the
        // browser confirms this graph is running.
        this.applyMasterGain();
        if (this.unlocked && this.activeGameId !== undefined) this.startActiveAmbience();
        this.notifyReadiness();
      })
      .catch(() => this.notifyReadiness());
  }

  private notifyReadiness(): void {
    this.onReadinessChange(this.getReadiness());
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted ? 0 : this.volumes.master;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  private captureBeforeUnlock(event: DisplayEvent): void {
    switch (event.type) {
      case "welcome":
      case "ambience_start":
        this.activeGameId = null;
        break;
      case "footsteps_welcome":
      case "cosmic_ambience_start":
        this.activeGameId = "follow-the-footsteps";
        break;
      case "bubblepop_welcome":
      case "underwater_ambience_start":
        this.activeGameId = "bubble-pop-wall";
        break;
      case "space_pilot_welcome":
      case "space_ambience_start":
        this.activeGameId = "space-pilot";
        break;
      case "color_chase_welcome":
      case "color_chase_ambience_start":
        this.activeGameId = "color-chase";
        break;
    }

    if (isDeferrableSpeechEvent(event)) {
      this.pendingSpeech = { kind: "event", event };
    }
  }

  /** A welcome is a hard session boundary even when the next session uses the same game. */
  private beginGameWelcome(gameId: GameId | null): void {
    this.voice.cancel();
    this.activeSpeechDucks = 0;
    this.applyAmbienceDucking();
    this.pendingSpeech = null;
    this.lastIncorrectSpeechAt = 0;
    this.lastBubblePopIncorrectSpeechAt = 0;
    for (const key of Object.keys(this.encouragementBandCounts) as EncouragementBand[]) {
      delete this.encouragementBandCounts[key];
    }
    this.footstepsMilestoneCount = 0;
    this.footstepsCheckpointCount = 0;
    this.bubblePopMilestoneCount = 0;
    this.spacePilotMilestoneCount = 0;
    this.activeGameId = gameId;
    this.startActiveAmbience();
  }

  private startActiveAmbience(): void {
    switch (this.activeGameId) {
      case "follow-the-footsteps":
        this.startCosmicAmbienceIfNeeded();
        break;
      case "bubble-pop-wall":
        this.startUnderwaterAmbienceIfNeeded();
        break;
      case "space-pilot":
        this.startSpaceAmbienceIfNeeded();
        break;
      case "color-chase":
        this.startColorChaseAmbienceIfNeeded();
        break;
      case "harvest-valley-3d":
    case "blooming-world-3d":
    case "fire-rescue-3d":
    case "pearl-voyage-3d":
      case "runner-quest-3d":
      case "mirror-quest-3d":
      case "safe-hex-arena-3d":
      case "turn-and-go-3d":
    case "build-quest-3d":
        break; // silent by design: no ambience, no music
      case "balloon-quest":
      case null:
        this.startAmbienceIfNeeded();
        break;
    }
  }

  private dispatch(event: DisplayEvent): void {
    // Existing, previously-unlocked contexts can be suspended again after
    // backgrounding/device changes. A best-effort resume on every real
    // audio event self-heals whenever browser policy permits it.
    this.ensureGraph();
    switch (event.type) {
      case "welcome":
        this.beginGameWelcome("balloon-quest");
        this.childName = event.childName;
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
        // Client feedback: correct feedback needed more excitement — a
        // short, friendly applause alongside the existing pop + chime.
        // Same effectsGain channel/volume as every other effect here, never
        // a separate ad-hoc audio call — see playApplause's doc comment for
        // why this stays clearly under Mariam's encouragement line, never
        // competing with it.
        this.playEffect((ctx, dest) => playApplause(ctx, dest));
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
        this.activeGameId = null;
        this.startActiveAmbience();
        break;
      case "ambience_stop":
        this.stopAmbience();
        break;

      case "waiting_world_greeting":
        this.speak(waitingWorldGreetingLine(), "high");
        break;

      case "paused":
        this.speak(pausedLine(), "high");
        break;

      // MULTI-GAME PLATFORM — Follow the Footsteps' own events (see
      // components/display/events.ts). Deliberately routed through their
      // own voice-line/effect modules (footstepsVoiceLines.ts,
      // cosmicEffects.ts, cosmicAmbience.ts) — nothing above this point in
      // the switch changed.
      case "footsteps_welcome":
        this.beginGameWelcome("follow-the-footsteps");
        this.childName = event.childName;
        this.playEffect((ctx, dest) => playCosmicIntroChime(ctx, dest));
        this.speak(footstepsWelcomeLine(event.childName), "high");
        break;

      case "footsteps_instruction":
        this.speak(footstepsInstructionLine(event.childName, event.stageNumber), "high");
        break;

      case "footstep_confirm": {
        const isLastStep = event.stepIndex + 1 >= event.totalSteps;
        if (isLastStep) {
          this.playEffect((ctx, dest) => playFootstepsChordResolve(ctx, dest));
        } else {
          this.playEffect((ctx, dest) => playFootstepChime(ctx, dest, event.stepIndex));
        }
        // Milestone encouragement every 3rd step — never after every single
        // step (per task section 24), and never on the very last step (the
        // stage-complete line already covers that moment).
        if (!isLastStep && event.stepIndex > 0 && event.stepIndex % 3 === 0 && this.childName) {
          const occurrenceIndex = this.footstepsMilestoneCount;
          const line = footstepsMilestoneLine(this.childName, occurrenceIndex);
          const spoken = this.speak(line, "normal");
          if (spoken) this.footstepsMilestoneCount += 1;
        }
        break;
      }

      case "footsteps_checkpoint_reached": {
        this.playEffect((ctx, dest) => playCheckpointChime(ctx, dest));
        const occurrenceIndex = this.footstepsCheckpointCount;
        const spoken = this.speak(footstepsCheckpointLine(occurrenceIndex), "high");
        if (spoken) this.footstepsCheckpointCount += 1;
        break;
      }

      // ROUTE ARCHITECTURE REWRITE — replaces the old SINGLE/PAIR stance
      // mechanic (ADVANCED only). "Active" fires the instant the child
      // starts walking toward an obstacle (high priority — this is a new
      // movement instruction, must not get stuck behind stale encouragement);
      // "cleared" fires its reward once the child has moved past it.
      case "footsteps_obstacle_active":
        this.speak(footstepsObstacleActiveLine(event.kind), "high");
        break;

      case "footsteps_obstacle_cleared":
        this.playEffect((ctx, dest) => playObstacleClearedEffect(ctx, dest, event.kind));
        this.speak(footstepsObstacleClearedLine(event.kind), "normal");
        break;

      case "footsteps_stage_complete":
        this.playEffect((ctx, dest) => playCosmicCelebration(ctx, dest, `stage${event.stageNumber}`));
        this.speak(footstepsStageCompleteLine(event.childName, event.stageNumber), "high");
        break;

      case "footsteps_session_complete":
        this.playEffect((ctx, dest) => playCosmicCelebration(ctx, dest, "session"));
        this.speak(footstepsSessionCompleteLine(event.childName), "high");
        break;

      case "cosmic_ambience_start":
        this.activeGameId = "follow-the-footsteps";
        this.startActiveAmbience();
        break;
      case "cosmic_ambience_stop":
        this.stopCosmicAmbience();
        break;

      // MULTI-GAME PLATFORM — Bubble Pop Wall's own events (see
      // components/display/events.ts). Routed through underwaterEffects.ts/
      // bubblePopVoiceLines.ts/underwaterAmbience.ts — this game DOES have
      // an incorrect branch (unlike Follow the Footsteps), with the same
      // gentle cooldown-gated tone as Balloon Quest's, and a per-TARGET
      // spoken request rather than one per-stage instruction line.
      case "bubblepop_welcome":
        this.beginGameWelcome("bubble-pop-wall");
        this.childName = event.childName;
        this.playEffect((ctx, dest) => playUnderwaterIntroSting(ctx, dest));
        this.speak(bubblePopWelcomeLine(event.childName), "high");
        break;

      case "bubblepop_ready_position":
        this.speak(bubblePopReadyPositionLine(event.childName, event.isFirstStage), "high");
        break;

      case "bubblepop_instruction":
        this.speak(bubblePopInstructionLine(event.childName, event.stageNumber), "high");
        break;

      case "bubblepop_target_request":
        this.speak(bubblePopTargetRequestLine(event.color, event.shape, event.announceShape), "high");
        break;

      case "bubblepop_sequence_request":
        this.speak(
          bubblePopSequenceRequestLine(
            event.firstColor,
            event.firstShape,
            event.announceFirstShape,
            event.secondColor,
            event.secondShape,
            event.announceSecondShape,
          ),
          "high",
        );
        break;

      case "bubblepop_pop":
        this.playEffect((ctx, dest) => playBubblePop(ctx, dest));
        break;

      case "bubblepop_correct": {
        // Milestone encouragement every 3rd correct pop — same "never after
        // every single one" cycling convention as Follow the Footsteps'
        // footstep_confirm handling above, deliberately not Balloon Quest's
        // percentage-band crossedEncouragementBand (that helper lives in
        // this game's own voiceLines.ts and stays scoped to it).
        const isLastTarget = event.correctCount >= event.totalTargets;
        if (!isLastTarget && event.correctCount > 0 && event.correctCount % 3 === 0 && this.childName) {
          const occurrenceIndex = this.bubblePopMilestoneCount;
          const line = bubblePopMilestoneLine(this.childName, occurrenceIndex);
          const spoken = this.speak(line, "normal");
          if (spoken) this.bubblePopMilestoneCount += 1;
        }
        break;
      }

      case "bubblepop_incorrect": {
        this.playEffect((ctx, dest) => playBubbleIncorrect(ctx, dest));
        const now = Date.now();
        if (now - this.lastBubblePopIncorrectSpeechAt > INCORRECT_SPEECH_COOLDOWN_MS) {
          this.lastBubblePopIncorrectSpeechAt = now;
          this.speak(bubblePopIncorrectLine(), "low");
        }
        break;
      }

      case "bubblepop_stage_complete":
        this.playEffect((ctx, dest) => playUnderwaterCelebration(ctx, dest, `stage${event.stageNumber}`));
        this.speak(bubblePopStageCompleteLine(event.childName, event.stageNumber), "high");
        break;

      case "bubblepop_session_complete":
        this.playEffect((ctx, dest) => playUnderwaterCelebration(ctx, dest, "session"));
        this.speak(bubblePopSessionCompleteLine(event.childName), "high");
        break;

      case "underwater_ambience_start":
        this.activeGameId = "bubble-pop-wall";
        this.startActiveAmbience();
        break;
      case "underwater_ambience_stop":
        this.stopUnderwaterAmbience();
        break;

      // SPACE PILOT — Level 1's own events (see components/display/events.ts).
      // Routed through spaceEffects.ts/spacePilotVoiceLines.ts/spaceAmbience.ts.
      // No "incorrect" branch (a missed star is never a failure, task's "no
      // punishment") and no per-star spoken line (task's "keep speech
      // minimal") — the visual star position/lane teaches the child, not
      // narration.
      case "space_pilot_welcome":
        this.beginGameWelcome("space-pilot");
        this.childName = event.childName;
        this.playEffect((ctx, dest) => playSpaceIntroSting(ctx, dest));
        this.speak(spacePilotWelcomeLine(event.childName), "high");
        break;

      case "space_pilot_ready_position":
        this.speak(spacePilotReadyPositionLine(), "high");
        break;

      case "space_pilot_instruction": {
        const line =
          event.difficulty === Difficulty.MEDIUM
            ? spacePilotMediumInstructionLine()
            : event.difficulty === Difficulty.ADVANCED
              ? spacePilotAdvancedInstructionLine()
              : spacePilotInstructionLine();
        this.speak(line, "high");
        break;
      }

      case "space_pilot_lane_change":
        this.playEffect((ctx, dest) => playLaneChangeSound(ctx, dest, event.direction));
        break;

      case "space_pilot_fire":
        this.playEffect((ctx, dest) => playFireSound(ctx, dest));
        break;

      case "space_pilot_asteroid_cleared":
        this.playEffect((ctx, dest) => playAsteroidClearSound(ctx, dest));
        break;

      case "space_pilot_asteroid_avoided":
        this.playEffect((ctx, dest) => playStarMissSound(ctx, dest));
        break;

      case "space_pilot_alien_passed":
        this.playEffect((ctx, dest) => playAlienPassSound(ctx, dest));
        break;

      case "space_pilot_portal":
        this.playEffect((ctx, dest) => playPortalSound(ctx, dest));
        break;

      case "space_pilot_star_collected": {
        this.playEffect((ctx, dest) => playStarCollectChime(ctx, dest, event.upgradeLevel));
        this.playEffect((ctx, dest) => playRocketUpgradeSound(ctx, dest));
        // Milestone encouragement every 3rd star — same "never after every
        // single one" cycling convention as every other game's own
        // correct/fed/pop handling above.
        if (event.upgradeLevel > 0 && event.upgradeLevel < TOTAL_STARS && event.upgradeLevel % 3 === 0 && this.childName) {
          const occurrenceIndex = this.spacePilotMilestoneCount;
          const line = spacePilotMilestoneLine(this.childName, occurrenceIndex);
          const spoken = this.speak(line, "normal");
          if (spoken) this.spacePilotMilestoneCount += 1;
        }
        break;
      }

      case "space_pilot_star_missed":
        this.playEffect((ctx, dest) => playStarMissSound(ctx, dest));
        break;

      case "space_pilot_final_star_collected":
        this.playEffect((ctx, dest) => playFinalStarChord(ctx, dest));
        this.speak(spacePilotFinalStarLine(event.childName), "high");
        break;

      case "space_pilot_stage_complete":
        this.playEffect((ctx, dest) => playSpaceCelebration(ctx, dest, "stage"));
        this.speak(spacePilotStageCompleteLine(event.childName, event.difficulty), "high");
        break;

      case "space_pilot_session_complete":
        this.playEffect((ctx, dest) => playSpaceCelebration(ctx, dest, "session"));
        this.speak(spacePilotSessionCompleteLine(event.childName), "high");
        break;

      case "space_ambience_start":
        this.activeGameId = "space-pilot";
        this.startActiveAmbience();
        break;
      case "space_ambience_stop":
        this.stopSpaceAmbience();
        break;

      case "color_chase_welcome":
        this.beginGameWelcome("color-chase");
        this.childName = event.childName;
        this.playEffect((ctx, dest) => playColorPadActivation(ctx, dest));
        this.speak(colorChaseWelcomeLine(event.childName), "high");
        break;
      case "color_chase_ready":
        this.speak(colorChaseReadyLine(), "high");
        break;
      case "color_chase_instruction":
        this.speak(colorChaseInstructionLine(event.instruction), "high");
        break;
      case "color_chase_target":
        this.speak(colorChaseTargetLine(event.color), "high");
        break;
      case "color_chase_pad_activation":
        this.playEffect((ctx, dest) => playColorPadActivation(ctx, dest));
        break;
      case "color_chase_correct":
        this.playEffect((ctx, dest) => playColorCorrect(ctx, dest, event.combo));
        break;
      case "color_chase_incorrect":
        this.playEffect((ctx, dest) => playColorWrong(ctx, dest));
        this.speak(colorChaseIncorrectLine(), "low");
        break;
      case "color_chase_danger":
        this.playEffect((ctx, dest) => playColorDanger(ctx, dest));
        this.speak(colorChaseDangerLine(), "high");
        break;
      case "color_chase_stage_complete":
        this.playEffect((ctx, dest) => playColorCelebration(ctx, dest, `stage${event.stageNumber}`));
        this.speak(colorChaseStageCompleteLine(event.childName), "high");
        break;
      case "color_chase_session_complete":
        this.playEffect((ctx, dest) => playColorCelebration(ctx, dest, "session"));
        this.speak(colorChaseSessionCompleteLine(event.childName), "high");
        break;
      case "color_chase_ambience_start":
        this.activeGameId = "color-chase";
        this.startActiveAmbience();
        break;
      case "color_chase_ambience_stop":
        this.stopColorChaseAmbience();
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
    this.stopCosmicAmbience();
    this.stopUnderwaterAmbience();
    this.stopSpaceAmbience();
    this.stopColorChaseAmbience();
    if (this.ambienceHandle || !this.ctx || !this.ambienceGain) return;
    try {
      this.ambienceHandle = startAmbience(this.ctx, this.ambienceGain);
    } catch {
      this.ambienceHandle = null;
    }
  }

  /** Starts the cosmic ambience, stopping any other game's ambience first if it happens to be running (e.g. left over from the shared waiting world) — only one game's ambience is ever meant to play at once. */
  private startCosmicAmbienceIfNeeded(): void {
    this.stopAmbience();
    this.stopUnderwaterAmbience();
    this.stopSpaceAmbience();
    this.stopColorChaseAmbience();
    if (this.cosmicAmbienceHandle || !this.ctx || !this.ambienceGain) return;
    try {
      this.cosmicAmbienceHandle = startCosmicAmbience(this.ctx, this.ambienceGain);
    } catch {
      this.cosmicAmbienceHandle = null;
    }
  }

  /** Starts the underwater ambience, stopping any other game's ambience first — same four-way mutual exclusion as every other start*IfNeeded method. */
  private startUnderwaterAmbienceIfNeeded(): void {
    this.stopAmbience();
    this.stopCosmicAmbience();
    this.stopSpaceAmbience();
    this.stopColorChaseAmbience();
    if (this.underwaterAmbienceHandle || !this.ctx || !this.ambienceGain) return;
    try {
      this.underwaterAmbienceHandle = startUnderwaterAmbience(this.ctx, this.ambienceGain);
    } catch {
      this.underwaterAmbienceHandle = null;
    }
  }

  /** Starts the deep-space ambience, stopping any other game's ambience first — same five-way mutual exclusion as every other start*IfNeeded method. */
  private startSpaceAmbienceIfNeeded(): void {
    this.stopAmbience();
    this.stopCosmicAmbience();
    this.stopUnderwaterAmbience();
    this.stopColorChaseAmbience();
    if (this.spaceAmbienceHandle || !this.ctx || !this.ambienceGain) return;
    try {
      this.spaceAmbienceHandle = startSpaceAmbience(this.ctx, this.ambienceGain);
    } catch {
      this.spaceAmbienceHandle = null;
    }
  }

  private stopCosmicAmbience(): void {
    this.cosmicAmbienceHandle?.stop();
    this.cosmicAmbienceHandle = null;
  }

  private stopUnderwaterAmbience(): void {
    this.underwaterAmbienceHandle?.stop();
    this.underwaterAmbienceHandle = null;
  }

  private stopSpaceAmbience(): void {
    this.spaceAmbienceHandle?.stop();
    this.spaceAmbienceHandle = null;
  }

  private startColorChaseAmbienceIfNeeded(): void {
    this.stopAmbience();
    this.stopCosmicAmbience();
    this.stopUnderwaterAmbience();
    this.stopSpaceAmbience();
    if (this.colorChaseAmbienceHandle || !this.ctx || !this.ambienceGain) return;
    try {
      this.colorChaseAmbienceHandle = startColorChaseAmbience(this.ctx, this.ambienceGain);
    } catch {
      this.colorChaseAmbienceHandle = null;
    }
  }

  private stopColorChaseAmbience(): void {
    this.colorChaseAmbienceHandle?.stop();
    this.colorChaseAmbienceHandle = null;
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
  speakCountdownTick(tick: CountdownTick): Promise<void> {
    const text = countdownLine(tick);
    return new Promise<void>((resolve) => {
      if (!this.unlocked) {
        // Keep only the visual tick that is current right now. Countdown
        // pacing must continue while locked; unlock() replays it only if it
        // is still fresh enough to make sense.
        this.pendingSpeech = { kind: "countdown", tick, requestedAt: Date.now() };
        resolve();
        return;
      }
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
    this.acquireAmbienceDuck();
    let attemptId = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.releaseAmbienceDuck();
      options.onSettled?.();
    };
    const attempt = (isRetry: boolean): boolean => {
      const myAttempt = ++attemptId;
      const accepted = this.voice.request(text, priority, {
        rate: options.rate,
        volume: this.volumes.voice,
        isRetry,
        onEnd: () => {
          if (myAttempt !== attemptId) return; // superseded by a retry — that attempt's own onEnd will settle instead
          finish();
        },
        onError: () => {
          if (myAttempt !== attemptId) return;
          if (priority === "high" && !isRetry && !attempt(true)) finish();
        },
      });
      return accepted;
    };
    const accepted = attempt(false);
    if (!accepted) finish();
    return accepted;
  }

  private acquireAmbienceDuck(): void {
    this.activeSpeechDucks += 1;
    this.applyAmbienceDucking();
  }

  private releaseAmbienceDuck(): void {
    this.activeSpeechDucks = Math.max(0, this.activeSpeechDucks - 1);
    this.applyAmbienceDucking();
  }

  private applyAmbienceDucking(): void {
    if (!this.ctx || !this.ambienceGain) return;
    const target = this.activeSpeechDucks > 0 ? this.volumes.ambience * AMBIENCE_DUCK_FACTOR : this.volumes.ambience;
    this.ambienceGain.gain.setTargetAtTime(target, this.ctx.currentTime, GAIN_RAMP_SECONDS);
  }
}

function isDeferrableSpeechEvent(event: DisplayEvent): boolean {
  switch (event.type) {
    case "welcome":
    case "start_zone":
    case "instruction":
    case "stage_complete":
    case "session_complete":
    case "waiting_world_greeting":
    case "paused":
    case "footsteps_welcome":
    case "footsteps_instruction":
    case "footsteps_checkpoint_reached":
    case "footsteps_obstacle_active":
    case "footsteps_stage_complete":
    case "footsteps_session_complete":
    case "bubblepop_welcome":
    case "bubblepop_ready_position":
    case "bubblepop_instruction":
    case "bubblepop_target_request":
    case "bubblepop_sequence_request":
    case "bubblepop_stage_complete":
    case "bubblepop_session_complete":
    case "space_pilot_welcome":
    case "space_pilot_ready_position":
    case "space_pilot_instruction":
    case "space_pilot_final_star_collected":
    case "space_pilot_stage_complete":
    case "space_pilot_session_complete":
    case "color_chase_welcome":
    case "color_chase_ready":
    case "color_chase_instruction":
    case "color_chase_target":
    case "color_chase_danger":
    case "color_chase_stage_complete":
    case "color_chase_session_complete":
      return true;
    default:
      return false;
  }
}

/** Picks the right obstacle-cleared sound per kind (task section 21: "METEOR breaks into star fragments, ROCK glows/cracks/dissolves, COMET sparkle sweep"). */
function playObstacleClearedEffect(ctx: AudioContext, destination: AudioNode, kind: RouteObstacleKind): void {
  switch (kind) {
    case RouteObstacleKind.METEOR:
      playMeteorBreakEffect(ctx, destination);
      break;
    case RouteObstacleKind.ROCK:
      playRockDissolveEffect(ctx, destination);
      break;
    case RouteObstacleKind.COMET:
      playCometSweepEffect(ctx, destination);
      break;
  }
}
