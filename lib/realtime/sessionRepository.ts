import { isUnstartedActivity, ownedByTab } from "@/lib/therapyVisits/gameSafety";
import { validProjectionPreview, type ProjectionPreviewCommand } from "@/lib/projection/calibration";
import {reviveBridgeLive} from '@/lib/balancebridge3d/live';
import { reportPublishIntent } from './publishIntent';
import {reviveCastleLive} from '@/lib/castlelegends3d/live';
import { reviveHarvestLive } from '@/lib/harvestvalley3d/live';
import { reviveBloomLive } from '@/lib/bloomingworld3d/live';
import { reviveDomeLive } from '@/lib/bubblepopwall3d/live';
import { reviveFireLive } from '@/lib/firerescue3d/live';
import { revivePearlLive } from '@/lib/pearlvoyage3d/live';
import { reviveMirrorLive } from '@/lib/mirrorquest3d/live';
import { reviveHexLive } from '@/lib/safehexarena3d/live';
import { reviveTurnGoLive } from '@/lib/turngo3d/live';
import { reviveFootMazeLive } from '@/lib/footmaze3d/live';
import { reviveRhythmLive } from '@/lib/rhythmsteps3d/live';
import { reviveBodySequenceLive } from '@/lib/bodysequence3d/live';
import { reviveAchievementForestLive } from '@/lib/achievementforest/live';
import { reviveAchievementCityLive } from '@/lib/achievementcity/live';
import { isFp3Live, reviveFootstepsLive } from '@/lib/footsteps3d/live';
import { isCc3Live, reviveColorChaseLive } from '@/lib/colorchase3d/live';
import { isBq3Session, reviveBq3Session } from "@/lib/balloonquest/live";
import { isRunnerSession, reviveRunnerSession } from "@/lib/runnerquest3d/live";
import { isBuildQuestLive, reviveBuildQuestLive } from "@/lib/buildquest3d/cloudState";
import { isSpacePilotLive, reviveSpacePilotLive } from "@/lib/spacepilot3d/cloudState";
import {
  type Database,
  get,
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  remove,
  serverTimestamp,
  update,
  type Unsubscribe,
} from "firebase/database";
import { getGameById, type GameId } from "@/lib/games/registry";
import { assertFirebaseSafeValue } from "@/lib/dataIntegrity/numeric";
import {
  reviveBubblePopSessionState,
  reviveFootstepsSessionState,
  reviveSessionState,
  reviveSpacePilotSessionState,
  reviveColorChaseSessionState,
} from "./serialization";
import type {
  AnySessionState,
  CelebrationReplaySignal,
  ConnectionStatus,
  ControllerLeaseRecord,
  DisplayAudioEnableCommand,
  DisplayAudioStatus,
  LiveInteraction,
  LiveSessionRecord,
  PresenceRecord,
} from "./types";

/**
 * The live-session/lease/presence data layer — everything above this layer
 * (the controller/display adapters) speaks in plain domain terms — publish
 * a session, subscribe to the live session, claim a lease — and has no
 * idea Firebase exists underneath. Swapping the realtime backend later
 * means rewriting this one file, not the adapters or any UI component. See
 * the Task 6 report's "Realtime repository architecture" section.
 *
 * STAFF AUTH FOUNDATION: staffRepository.ts is a second, deliberately
 * separate firebase/database entry point for the ONE unrelated domain
 * (the staff allowlist) — kept out of this file so this one stays scoped
 * to live gameplay data only.
 *
 * AUTH ISOLATION HARDENING: unlike every other data layer in this app
 * (patientRepository.ts, staffRepository.ts, sessionHistoryRepository.ts —
 * all staff-only, so they always use firebaseClient.ts's getStaffDb()),
 * THIS file's functions are called from BOTH surfaces —
 * lib/control/useRealtimeControllerSession.ts (the staff app) AND
 * lib/display/useRealtimeDisplaySession.ts / components/display/DisplayScreen.tsx
 * (the display app) — so it can no longer reach for one hardcoded shared
 * Database instance internally. Every exported function below now takes
 * the caller's own `db: Database` as its first parameter instead; callers
 * pass `getStaffDb()` or `getDisplayDb()` (see firebaseClient.ts)
 * depending on which surface they run on. This file itself stays entirely
 * unaware of "staff" vs "display" — it's just handed a connection.
 */

const LIVE_SESSION_PATH = "liveSession";
/** Staff-only sibling of the live record: the saved-patient binding. The anonymous Display can read LIVE_SESSION_PATH but never this node. */
const LIVE_SESSION_PRIVATE_PATH = "liveSessionPrivate";
const STAFF_APP_NAME = "shumos-staff";

/** Only the staff Firebase app may read LIVE_SESSION_PRIVATE_PATH; the Display app (anonymous auth) must never try. Unknown handles (test doubles) are treated as non-staff. */
function canReadPrivate(db: Database): boolean {
  return (db as { app?: { name?: string } }).app?.name === STAFF_APP_NAME;
}
const CONTROLLER_LEASE_PATH = "controllerLease";
const CONTROLLER_PRESENCE_PATH = "presence/controller";
const DISPLAY_PRESENCE_PATH = "presence/display";

// ---------------------------------------------------------------------------
// Live session
// ---------------------------------------------------------------------------

export interface PublishSessionInput {
  /** MULTI-GAME PLATFORM: which registered game this canonical session belongs to — always required, always known by whichever game's controller is publishing (see lib/games/registry.ts's BALLOON_QUEST_GAME_ID). Never inferred. */
  gameId: GameId;
  sessionId: string;
  revision: number;
  session: AnySessionState;
  lastInteraction: LiveInteraction | null;
  /** TASK 9: omit to leave whatever's already there untouched (the common case — every ordinary action); pass explicitly only from replayCelebration(). */
  celebrationReplay?: CelebrationReplaySignal | null;
  /** SESSION HISTORY TASK: the saved patient this session belongs to, or null for a walk-in session — see LiveSessionRecord.patientId's doc comment. Always required (unlike celebrationReplay) since every publish must carry the SAME value the session was created with; see useRealtimeControllerSession.ts's publish(). */
  patientId: string | null;
}

/**
 * Publishes the new canonical session in one atomic multi-location update —
 * gameId/sessionId/revision/session/lastInteraction always change together,
 * so no subscriber can ever observe a torn write (e.g. new session with
 * stale revision, or vice versa). celebrationReplay rides along in the same
 * update purely so it shares this call's revision bump (see
 * database.rules.json — any write under liveSession must increase
 * `revision`, and celebrationReplay is presentation state, not something
 * that deserves its own parallel write path).
 */
export async function publishSession(db: Database, input: PublishSessionInput): Promise<void> {
  const payload: Record<string, unknown> = {
    gameId: input.gameId,
    sessionId: input.sessionId,
    revision: input.revision,
    session: input.session,
    // Firebase's update() throws outright on `undefined` (unlike `null`,
    // which is a valid "delete this field" value) — coerce defensively here
    // so a caller can never accidentally break every subsequent write by
    // passing through an undefined it read back from RTDB. See
    // subscribeToLiveSession below for why that's a real, not hypothetical, risk.
    lastInteraction: input.lastInteraction ?? null,
    updatedAt: serverTimestamp(),
  };
  if (input.celebrationReplay !== undefined) payload.celebrationReplay = input.celebrationReplay;
  assertFirebaseSafeValue(payload);
  // PRIVACY: the patient binding is NOT part of the Display-readable record. It lives in the staff-only
  // liveSessionPrivate node and rides in the same multi-location update, so the two never diverge.
  // `liveSession/patientId: null` also scrubs the field from records written by an older client.
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) updates[`${LIVE_SESSION_PATH}/${key}`] = value;
  updates[`${LIVE_SESSION_PATH}/patientId`] = null;
  updates[LIVE_SESSION_PRIVATE_PATH] = input.patientId
    ? { sessionId: input.sessionId, patientId: input.patientId, updatedAt: serverTimestamp() }
    : null;
  const intent: LiveSessionRecord = { ...input, updatedAt: Date.now(), celebrationReplay: input.celebrationReplay ?? null };
  reportPublishIntent({ record: intent, acknowledged: false });
  await update(ref(db), updates);
  reportPublishIntent({ record: intent, acknowledged: true });
}

/** Normalizes a raw gameId value read back from Firebase — null for anything not a currently-registered game (missing/old/unsupported/malformed), never a guess. See LiveSessionRecord.gameId's doc comment. */
function normalizeGameId(raw: unknown): GameId | null {
  return typeof raw === "string" && getGameById(raw) ? (raw as GameId) : null;
}

/** Therapist tapped "جلسة جديدة" (or there is nothing to clean up yet): removes the whole node, taking the child's name and every stage result with it. */
export async function clearLiveSession(db: Database): Promise<void> {
  await update(ref(db), { [LIVE_SESSION_PATH]: null, [LIVE_SESSION_PRIVATE_PATH]: null });
}

/** Re-attaches the staff-only patient binding to a raw live value. A binding that belongs to another session is ignored; a legacy in-record patientId (older client) is kept only when no binding exists. */
function mergePrivate(liveRaw: unknown, privateRaw: unknown): unknown {
  if (!liveRaw || typeof liveRaw !== "object") return liveRaw;
  const live = liveRaw as { sessionId?: unknown };
  const priv = privateRaw as { sessionId?: unknown; patientId?: unknown } | null | undefined;
  if (priv && typeof priv === "object" && typeof priv.patientId === "string" && priv.sessionId === live.sessionId) {
    return { ...live, patientId: priv.patientId };
  }
  return liveRaw;
}

function parseLiveSessionValue(raw: unknown): LiveSessionRecord | null {
  const value = raw as LiveSessionRecord | null;
  if (!value || !Number.isInteger(value.revision) || value.revision < 0 || !value.session) return null;
  // See lib/realtime/serialization.ts: RTDB drops empty arrays and null
  // scalars on read-back, so the raw snapshot is never handed to callers
  // as-is — it's reconstructed into the exact shape SessionState promises.
  // lastInteraction is the same story at the top level: publishSession's
  // own `lastInteraction: null` (the common case — most actions don't
  // produce one) comes back as `undefined`, not `null`, once round-tripped.
  //
  // TASK 12: reviveSessionState assumes its input is genuinely well-formed
  // (per the CURRENT SessionState shape) and throws on a structurally
  // incompatible one — the exact failure mode a stale pre-Task-11 record
  // (still shaped as `stages[]`/`currentStageIndex` instead of
  // `currentStage`/`currentDifficulty`) hits, crashing this callback with no
  // error boundary to catch it and permanently freezing whichever tab
  // subscribed first (see the Task 12 report's root-cause section). This
  // function's own doc comment already promises "never throws on malformed/
  // partial data" — the try/catch below is what actually keeps that promise
  // for a shape this malformed, not just a missing field.
  try {
    const rawPatientId = (value as { patientId?: unknown }).patientId;
    const gameId = normalizeGameId((value as { gameId?: unknown }).gameId);
    if (!gameId || typeof value.sessionId !== "string" || value.sessionId.length === 0) return null;
    // MULTI-GAME PLATFORM: which revive function applies depends entirely on
    // the record's OWN gameId, never guessed from shape — a record whose
    // gameId is missing/unsupported/malformed already normalizes to null
    // above and is treated as "no session" by every caller (see
    // LiveSessionRecord.gameId's doc comment), so it's safe to default to
    // Balloon Quest's reviver here without ever silently misinterpreting a
    // genuine Follow the Footsteps/Bubble Pop Wall session as one.
    // BALLOON QUEST 3D: same game id, new engine — a record tagged `engine: "bq3"` is revived by its own validator (null = malformed -> treated as no session). Untagged balloon-quest records stay on the legacy reviver, unchanged.
    if (gameId === "balloon-quest" && isBq3Session(value.session)) {
      const bq3 = reviveBq3Session(value.session);
      if (!bq3 || bq3.sessionId !== value.sessionId) return null;
      return {
        ...value,
        gameId,
        session: bq3,
        lastInteraction: value.lastInteraction ?? null,
        celebrationReplay: value.celebrationReplay ?? null,
        patientId: typeof rawPatientId === "string" ? rawPatientId : null,
      };
    }
    // RUNNER QUEST 3D: its own game id and its own strict reviver; malformed => no session (waiting world), never a guess.
    if (gameId === "runner-quest-3d") {
      if (!isRunnerSession(value.session)) return null;
      const rq = reviveRunnerSession(value.session);
      if (!rq || rq.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: rq, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    // BUILD QUEST 3D: same shared record, its own strict reviver; malformed => no session (waiting world), never a guess.
    if (gameId === "harvest-valley-3d") {
      const harvest = reviveHarvestLive(value.session);
      if (!harvest || harvest.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: harvest, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "balance-bridge-3d") {
      const bridge = reviveBridgeLive(value.session);
      if (!bridge || bridge.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: bridge, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "blooming-world-3d") {
      const bloom = reviveBloomLive(value.session);
      if (!bloom || bloom.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: bloom, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "pearl-voyage-3d") {
      const pearl = revivePearlLive(value.session);
      if (!pearl || pearl.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: pearl, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "fire-rescue-3d") {
      const fire = reviveFireLive(value.session);
      if (!fire || fire.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: fire, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "shumos-castle-legends-3d") {
      const castle = reviveCastleLive(value.session);
      if (!castle || castle.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: castle, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "mirror-quest-3d") {
      const mirror = reviveMirrorLive(value.session);
      if (!mirror || mirror.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: mirror, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "bubble-pop-wall" && (value.session as { engine?: string }).engine === "dome3") {
      const dome = reviveDomeLive(value.session);
      if (!dome || dome.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: dome, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "safe-hex-arena-3d") {
      const hex = reviveHexLive(value.session);
      if (!hex || hex.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: hex, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "turn-and-go-3d") {
      const tg = reviveTurnGoLive(value.session);
      if (!tg || tg.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: tg, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "foot-maze-3d") {
      const fm = reviveFootMazeLive(value.session);
      if (!fm || fm.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: fm, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "rhythm-steps-3d") {
      const rhythm = reviveRhythmLive(value.session);
      if (!rhythm || rhythm.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: rhythm, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "achievement-forest-3d") {
      const ac = reviveAchievementForestLive(value.session);
      if (!ac || ac.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: ac, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "achievement-city-3d") {
      const ac = reviveAchievementCityLive(value.session);
      if (!ac || ac.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: ac, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "body-sequence-3d") {
      const bs = reviveBodySequenceLive(value.session);
      if (!bs || bs.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: bs, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    if (gameId === "build-quest-3d") {
      if (!isBuildQuestLive(value.session)) return null;
      const bq = reviveBuildQuestLive(value.session);
      if (!bq || bq.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: bq, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    // SPACE PILOT 3D: same game id, new engine (`engine: "sp3"`): its own strict reviver. Untagged space-pilot records stay on the legacy reviver, unchanged.
    if (gameId === "space-pilot" && isSpacePilotLive(value.session)) {
      const sp = reviveSpacePilotLive(value.session);
      if (!sp || sp.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: sp, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    // FOLLOW THE FOOTSTEPS 3D: same game id, new engine (`engine: "fp3"`): its own strict reviver. Untagged records stay on the original reviver, unchanged.
    if (gameId === "follow-the-footsteps" && isFp3Live(value.session)) {
      const fp = reviveFootstepsLive(value.session);
      if (!fp || fp.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: fp, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    // COLOR CHASE 3D: same game id, new engine (`engine: "cc3"`): its own strict reviver. Untagged records stay on the original reviver, unchanged.
    if (gameId === "color-chase" && isCc3Live(value.session)) {
      const cc = reviveColorChaseLive(value.session);
      if (!cc || cc.sessionId !== value.sessionId) return null;
      return { ...value, gameId, session: cc, lastInteraction: value.lastInteraction ?? null, celebrationReplay: value.celebrationReplay ?? null, patientId: typeof rawPatientId === "string" ? rawPatientId : null };
    }
    const session =
      gameId === "follow-the-footsteps"
        ? reviveFootstepsSessionState(value.session)
        : gameId === "bubble-pop-wall"
          ? reviveBubblePopSessionState(value.session)
            : gameId === "space-pilot"
              ? reviveSpacePilotSessionState(value.session)
              : gameId === "color-chase"
                ? reviveColorChaseSessionState(value.session)
                : reviveSessionState(value.session);
    if (session.sessionId !== value.sessionId) return null;
    return {
      ...value,
      gameId,
      session,
      lastInteraction: value.lastInteraction ?? null,
      celebrationReplay: value.celebrationReplay ?? null,
      // RTDB drops a null scalar on write — an old/walk-in record with no
      // patientId round-trips with the key simply MISSING, not `null`.
      patientId: typeof rawPatientId === "string" ? rawPatientId : null,
    };
  } catch {
    return null;
  }
}

/**
 * Subscribes to the one live session. Fires `null` when no session exists
 * (fresh install, or right after clearLiveSession) — callers render the
 * waiting state for that. Never throws on malformed/partial data; treats it
 * as "no session" defensively since a half-written node should never be
 * presented as real.
 *
 * Pairs the persistent onValue() listener with a one-shot get() fired at
 * the same time. This isn't redundant: under React StrictMode's dev-only
 * mount -> cleanup -> remount cycle, the first (throwaway) subscription's
 * pending initial snapshot can race with its own teardown, and the
 * surviving (second) listener can end up never receiving an initial
 * dispatch — observed directly (Task 7 QA: a fresh /control open against
 * an existing live session intermittently rendered the empty SETUP screen
 * instead of recovering it, with no console error). get() is a one-shot
 * promise, not a persistent registration, so it isn't subject to that
 * listener-teardown race, and guarantees the caller always ends up with
 * the current value. If onValue's own initial dispatch also lands, the
 * second delivery is harmless — identical data re-render, or (for
 * revision-guarded callers like the display) rejected as a non-progressing
 * duplicate revision.
 */
export function subscribeToLiveSession(db: Database, callback: (record: LiveSessionRecord | null) => void): Unsubscribe {
  if (!canReadPrivate(db)) return subscribeWithInitialGet(db, LIVE_SESSION_PATH, parseLiveSessionValue, callback);
  // Staff: combine the public record with the staff-only binding. The two nodes are updated atomically on the server but
  // delivered as separate events, so emission is coalesced to one macrotask; otherwise a controller could briefly see the new
  // record with the old binding and republish a walk-in (null) binding.
  let liveRaw: unknown;
  let privateRaw: unknown;
  let liveLoaded = false;
  let privateLoaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const flush = () => {
    timer = undefined;
    if (stopped || !liveLoaded || !privateLoaded) return;
    callback(parseLiveSessionValue(mergePrivate(liveRaw, privateRaw)));
  };
  const schedule = () => { if (timer === undefined) timer = setTimeout(flush, 0); };
  const stopLive = subscribeRaw(db, LIVE_SESSION_PATH, (raw) => { liveRaw = raw; liveLoaded = true; schedule(); }, () => {});
  const stopPrivate = subscribeRaw(db, LIVE_SESSION_PRIVATE_PATH, (raw) => { privateRaw = raw; privateLoaded = true; schedule(); },
    // Unreadable (rules not yet published / inactive staff): behave as "no binding", never block the live record.
    () => { privateRaw = null; privateLoaded = true; schedule(); });
  return () => { stopped = true; if (timer !== undefined) clearTimeout(timer); stopLive(); stopPrivate(); };
}

/** Same onValue + one-shot get() pairing as subscribeWithInitialGet, but raw values and an error hook. */
function subscribeRaw(db: Database, path: string, onRaw: (raw: unknown) => void, onError: () => void): Unsubscribe {
  const valueRef = ref(db, path);
  // The listener is authoritative: a one-shot get() that resolves after the first listener event is older data and is dropped.
  let listenerDelivered = false;
  let stopped = false;
  void get(valueRef).then((snapshot) => { if (!stopped && !listenerDelivered) onRaw(snapshot.val()); }).catch(() => { if (!stopped && !listenerDelivered) onError(); });
  const unsubscribe = onValue(valueRef, (snapshot) => { if (!stopped) { listenerDelivered = true; onRaw(snapshot.val()); } }, () => { if (!stopped) onError(); });
  return () => { stopped = true; unsubscribe(); };
}

/**
 * RELIABILITY FIX — one-shot fetch of the live session's CURRENT canonical
 * value, used by useRealtimeControllerSession.ts's publish() to resync
 * local state after a failed write. A failed publishSession() call means
 * the server never accepted the local optimistic update, but — unlike a
 * successful write — that never triggers a new onValue delivery either
 * (nothing on the server actually changed), so nothing would otherwise
 * correct the now-wrong local state. This is the same get()+parse pairing
 * subscribeToLiveSession's initial fetch already uses, exposed standalone
 * so a failure handler can call it on demand rather than needing a live
 * subscription.
 */
export async function fetchLiveSession(db: Database): Promise<LiveSessionRecord | null> {
  const snapshot = await get(ref(db, LIVE_SESSION_PATH));
  if (!canReadPrivate(db)) return parseLiveSessionValue(snapshot.val());
  const priv = await get(ref(db, LIVE_SESSION_PRIVATE_PATH)).then((s) => s.val(), () => null);
  return parseLiveSessionValue(mergePrivate(snapshot.val(), priv));
}

/**
 * Pairs a persistent onValue() listener with a one-shot get() fired at the
 * same time, for any single-value path — the general form of the fix
 * documented above subscribeToLiveSession. Every plain "subscribe to one
 * path" function in this file goes through this, not just the live
 * session: the same lost-initial-dispatch race hit subscribeToControllerLease
 * during Task 7 QA (a second controller's lease check silently defaulted to
 * "unclaimed" and would have let it mutate an active session — see report).
 */
function subscribeWithInitialGet<T>(db: Database, path: string, parse: (raw: unknown) => T, callback: (value: T) => void): Unsubscribe {
  return subscribeRaw(db, path, (raw) => callback(parse(raw)), () => {});
}

// ---------------------------------------------------------------------------
// Controller lease (see lib/control/useRealtimeControllerSession.ts for the
// cooperative ownership model this supports) — staff-only in practice
// (Security Rules require active staff auth), always called with getStaffDb().
// ---------------------------------------------------------------------------

export async function claimControllerLease(db: Database, ownerId: string): Promise<void> {
  const leaseRef = ref(db, CONTROLLER_LEASE_PATH);
  // Released automatically if this tab/device disconnects without an explicit handoff.
  await onDisconnect(leaseRef).remove();
  await update(leaseRef, { ownerId, claimedAt: Date.now(), updatedAt: serverTimestamp() });
}

/** Periodic heartbeat so a stale lease (crashed tab that never fired onDisconnect) can be told apart from a live one — see report. */
export async function refreshControllerLease(db: Database): Promise<void> {
  await update(ref(db, CONTROLLER_LEASE_PATH), { updatedAt: serverTimestamp() });
}

export async function releaseControllerLease(db: Database): Promise<void> {
  await remove(ref(db, CONTROLLER_LEASE_PATH));
}

export function subscribeToControllerLease(db: Database, callback: (lease: ControllerLeaseRecord | null) => void): Unsubscribe {
  return subscribeWithInitialGet(db, CONTROLLER_LEASE_PATH, (raw) => (raw as ControllerLeaseRecord | null) ?? null, callback);
}

// ---------------------------------------------------------------------------
// Presence — idiomatic RTDB pattern: onDisconnect() lets the SERVER flip
// `connected` to false the instant the socket actually drops, which is far
// more reliable than a client-side heartbeat/timeout guess.
// ---------------------------------------------------------------------------

function registerPresence(db: Database, path: string): Unsubscribe {
  const presenceRef = ref(db, path);
  const connectedRef = ref(db, ".info/connected");

  return onValue(connectedRef, (snapshot) => {
    if (snapshot.val() !== true) return;
    // RELIABILITY FIX — these were previously bare `void`-fired promises
    // with no error handling at all, so any rejection (e.g. a momentary
    // PERMISSION_DENIED right after a reconnect, before auth has fully
    // re-settled) surfaced as an unhandled promise rejection instead of a
    // visible, attributable log line. Logged, never silently swallowed —
    // see the report's "Database is closing/hidden" investigation for why
    // this exact reconnect window is where this class of failure lives.
    //
    // Re-registered every time this client (re)connects — required because
    // onDisconnect handlers do not survive a reconnect, only a single
    // connection's lifetime.
    void onDisconnect(presenceRef)
      .update({ connected: false, updatedAt: serverTimestamp() })
      .catch((error: unknown) => console.error(`[realtime] onDisconnect setup failed for ${path}:`, error));
    void update(presenceRef, { connected: true, updatedAt: serverTimestamp() }).catch((error: unknown) =>
      console.error(`[realtime] presence update failed for ${path}:`, error),
    );
  });
}

export function registerControllerPresence(db: Database): Unsubscribe {
  return registerPresence(db, CONTROLLER_PRESENCE_PATH);
}

export function registerDisplayPresence(db: Database): Unsubscribe {
  const stopPresence = registerPresence(db, DISPLAY_PRESENCE_PATH);
  let connected = false;
  const stopConnection = onValue(ref(db, ".info/connected"), snapshot => { connected = snapshot.val() === true; });
  // A real heartbeat is necessary before Control can distinguish stale Display flags.
  const timer = setInterval(() => {
    if (!connected) return;
    void update(ref(db, DISPLAY_PRESENCE_PATH), { updatedAt: serverTimestamp() }).catch(() => {});
  }, 15000);
  return () => { clearInterval(timer); stopConnection(); stopPresence(); };
}

/**
 * TASK 9 PART 4: best-effort status report so the therapist can see the
 * projector's fullscreen state without walking over to check — see
 * lib/display/useFullscreen.ts. A plain merge update, not a full
 * onDisconnect-managed presence record: this is a secondary flag on the
 * SAME presence/display node registerDisplayPresence() already owns, not a
 * new path. Never awaited by any caller that can't afford to wait on it —
 * fullscreen status is informational only.
 */
export async function reportDisplayFullscreen(db: Database, isFullscreen: boolean): Promise<void> {
  await update(ref(db, DISPLAY_PRESENCE_PATH), { fullscreen: isFullscreen });
}

/** Control -> display command. Success means "delivered to RTDB", never "audio is ready". */
export async function requestDisplayAudioEnable(db: Database, command: DisplayAudioEnableCommand): Promise<void> {
  await update(ref(db, DISPLAY_PRESENCE_PATH), { audioEnableCommand: command });
}

/** Display -> control acknowledgement based on the display's real AudioContext state. */
export async function reportDisplayAudioStatus(
  db: Database,
  status: Omit<DisplayAudioStatus, "updatedAt">,
): Promise<void> {
  await update(ref(db, DISPLAY_PRESENCE_PATH), {
    audioStatus: { ...status, updatedAt: serverTimestamp() },
  });
}

/**
 * SENSOR INTEGRATION: throttled control -> display pointer mirror (see
 * PresenceRecord.controllerPointer's doc comment) — called from
 * components/control/sensors/SensorPointerDisplaySync.tsx, never at the raw
 * 50Hz BLE sample rate. `null` clears the field (sensor disconnected, or no
 * pointer to show), same "merge onto presence/display" shape every other
 * control->display command here uses — no new path, no rules change.
 */
export async function reportControllerPointer(db: Database, pointer: { x: number; y: number; visible: boolean } | null): Promise<void> {
  await update(ref(db, DISPLAY_PRESENCE_PATH), {
    controllerPointer: pointer ? { ...pointer, updatedAt: serverTimestamp() } : null,
  });
}

/** Display-side read of the mirrored pointer — see reportControllerPointer above. Never throws on malformed/partial data; treats it as "no pointer" defensively. */
export function subscribeToControllerPointer(
  db: Database,
  callback: (pointer: { x: number; y: number; visible: boolean } | null) => void,
): Unsubscribe {
  return subscribeWithInitialGet(
    db,
    `${DISPLAY_PRESENCE_PATH}/controllerPointer`,
    (raw) => {
      const value = raw as { x?: unknown; y?: unknown; visible?: unknown } | null;
      return value && typeof value.x === "number" && typeof value.y === "number" && typeof value.visible === "boolean"
        ? { x: value.x, y: value.y, visible: value.visible }
        : null;
    },
    callback,
  );
}

export function subscribeToDisplayAudioEnableCommand(
  db: Database,
  callback: (command: DisplayAudioEnableCommand | null) => void,
): Unsubscribe {
  return subscribeWithInitialGet(db, `${DISPLAY_PRESENCE_PATH}/audioEnableCommand`, (raw) => {
    const value = raw as Partial<DisplayAudioEnableCommand> | null;
    return value && typeof value.id === "string" && typeof value.requestedAt === "number"
      ? { id: value.id, requestedAt: value.requestedAt }
      : null;
  }, callback);
}

/**
 * BUG FIX — "ابدأ" stall (see PresenceRecord.countdownComplete's doc
 * comment): /display calls this the instant its OWN CountdownScene
 * genuinely finishes for a given (sessionId, revision) — real Mariam-paced
 * completion, not a guess. Same "best-effort merge onto presence/display"
 * shape as reportDisplayFullscreen above — no new path, no Security Rules
 * change, and it never grants /display any authority over the canonical
 * `liveSession` (only useRealtimeControllerSession.ts ever calls
 * publishSession()) — this is a separate, presentational signal.
 */
export async function reportCountdownComplete(db: Database, sessionId: string, revision: number): Promise<void> {
  await update(ref(db, DISPLAY_PRESENCE_PATH), { countdownComplete: { sessionId, revision } });
}

/**
 * Controller-only: resolves the moment presence/display reports a
 * countdownComplete signal matching (sessionId, revision) exactly — a
 * signal for any OTHER revision (a stale one left over from an earlier
 * stage, or one that simply hasn't arrived yet) is ignored, never treated
 * as a match. The caller is expected to race `promise` against its own
 * safety timeout (see useRealtimeControllerSession.ts's
 * runInstructionsToPlaying) and always call `cancel()` afterwards either
 * way, so this never leaks a listener.
 */
export function waitForDisplayCountdownComplete(db: Database, sessionId: string, revision: number): { promise: Promise<void>; cancel: () => void } {
  const presenceRef = ref(db, DISPLAY_PRESENCE_PATH);
  let unsubscribe: Unsubscribe = () => {};
  const promise = new Promise<void>((resolve) => {
    unsubscribe = onValue(presenceRef, (snapshot) => {
      const value = snapshot.val() as { countdownComplete?: { sessionId?: string; revision?: number } | null } | null;
      const signal = value?.countdownComplete;
      if (signal && signal.sessionId === sessionId && signal.revision === revision) resolve();
    });
  });
  return { promise, cancel: () => unsubscribe() };
}

export function subscribeToDisplayPresence(db: Database, callback: (presence: PresenceRecord | null) => void): Unsubscribe {
  return subscribeWithInitialGet(db, DISPLAY_PRESENCE_PATH, (raw) => (raw as PresenceRecord | null) ?? null, callback);
}

export function subscribeToControllerPresence(db: Database, callback: (presence: PresenceRecord | null) => void): Unsubscribe {
  return subscribeWithInitialGet(db, CONTROLLER_PRESENCE_PATH, (raw) => (raw as PresenceRecord | null) ?? null, callback);
}

// ---------------------------------------------------------------------------
// This client's own connection status, from RTDB's special `.info/connected`.
// ---------------------------------------------------------------------------

export function subscribeToConnectionStatus(db: Database, callback: (status: ConnectionStatus) => void): Unsubscribe {
  callback("connecting");
  return onValue(ref(db, ".info/connected"), (snapshot) => {
    callback(snapshot.val() === true ? "connected" : "disconnected");
  });
}

export async function requestProjectionPreview(db: Database, command: ProjectionPreviewCommand): Promise<void> {
  if (!validProjectionPreview(command)) throw new Error("Invalid projection preview");
  await update(ref(db, CONTROLLER_PRESENCE_PATH), { connected: true, projectionCommand: command });
}
export function subscribeToProjectionPreview(db: Database, callback: (command: ProjectionPreviewCommand | null) => void): Unsubscribe {
  return subscribeWithInitialGet(db, `${CONTROLLER_PRESENCE_PATH}/projectionCommand`, raw => {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as ProjectionPreviewCommand;
    const value = { ...c, profile: c.profile ? { ...c.profile, measuredWidthCm: c.profile.measuredWidthCm ?? null, measuredHeightCm: c.profile.measuredHeightCm ?? null } : c.profile };
    return validProjectionPreview(value) ? value : null;
  }, callback);
}

/** After the old Control has unmounted, clear only that tab's never-started preview. A concurrent Start aborts deletion. */
export async function discardUnstartedPreview(db: Database, sessionId: string, tabId: string): Promise<boolean> {
  const binding = (await get(ref(db, LIVE_SESSION_PRIVATE_PATH))).val() as {sessionId?: string; patientId?: string; updatedAt?: number} | null;
  await get(ref(db, LIVE_SESSION_PATH)); // Prime the transaction cache; an empty local cache must not abort a valid cleanup.
  const result = await runTransaction(ref(db, LIVE_SESSION_PATH), raw => {
    const record = parseLiveSessionValue(raw);
    if (!record || record.sessionId !== sessionId || !isUnstartedActivity(record) || !ownedByTab(record, tabId)) return;
    return null;
  }, { applyLocally: false });
  if (!result.committed) return false;
  if (binding?.sessionId === sessionId && typeof binding.updatedAt === "number" && Number.isFinite(binding.updatedAt)) {
    await runTransaction(ref(db, LIVE_SESSION_PRIVATE_PATH), raw =>
      raw?.sessionId === sessionId && raw.patientId === binding.patientId && raw.updatedAt === binding.updatedAt ? null : undefined, { applyLocally: false });
  }
  return true;
}
