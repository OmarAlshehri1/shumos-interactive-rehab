import {
  get,
  onValue,
  ref,
  runTransaction,
  set,
  update,
  type Database,
} from "firebase/database";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import {
  fetchLiveSession,
  claimControllerLease,
  discardUnstartedPreview,
} from "@/lib/realtime/sessionRepository";
import {
  confirmedLiveResult,
  historyKeyForLive,
  isUnstartedActivity,
  ownedByTab,
} from "@/lib/therapyVisits/gameSafety";
import {
  parseCommand,
  validVideo,
  type Video,
  type VideoCommand,
} from "./model";
export const COMMAND_PATH = "presence/display/youtubeCommand";
export const STATUS_PATH = "presence/display/youtubeStatus";
export interface VideoStatus {
  commandId: string;
  sessionId: string;
  state: string;
  position: number;
  updatedAt: number;
}
export const favoritesPath = (uid: string) => `youtubeFavorites/${uid}`;
export function subscribeFavorites(
  db: Database,
  uid: string,
  cb: (v: Video[]) => void,
  error: (e: Error) => void,
) {
  return onValue(
    ref(db, favoritesPath(uid)),
    (s) => cb(Object.values(s.val() ?? {}).filter(validVideo)),
    error,
  );
}
export async function toggleFavorite(
  db: Database,
  uid: string,
  v: Video,
  add: boolean,
) {
  if (!validVideo(v)) throw Error("فيديو غير صالح");
  await set(
    ref(db, `${favoritesPath(uid)}/${v.videoId}`),
    add ? { videoId: v.videoId, title: v.title, channel: v.channel } : null,
  );
}
export function subscribeCommand(
  db: Database,
  cb: (c: VideoCommand | null) => void,
  error?: (e: Error) => void,
) {
  return onValue(
    ref(db, COMMAND_PATH),
    (s) => cb(parseCommand(s.val())),
    error,
  );
}
/** Clear only this window's proven disposable activity. Recheck inside the transaction. */
export async function prepareVideoDisplay(
  db: Database,
  uid: string,
  tab: string,
) {
  const live = await fetchLiveSession(db);
  if (live) {
    if (isUnstartedActivity(live) && ownedByTab(live, tab))
      await discardUnstartedPreview(db, live.sessionId, tab);
    else {
      const key = historyKeyForLive(live);
      const proof =
        live.patientId && key
          ? await getSessionHistoryRecord(live.patientId, key)
          : null;
      if (
        live.session.gameState !== "SESSION_COMPLETE" ||
        !ownedByTab(live, tab) ||
        (live.patientId && !confirmedLiveResult(live, proof))
      )
        throw Error("أكمل النشاط واحفظ نتيجته قبل تشغيل الفيديو.");
      const binding = (await get(ref(db, "liveSessionPrivate"))).val();
      const result = await runTransaction(
        ref(db, "liveSession"),
        (raw) =>
          raw?.sessionId === live.sessionId &&
          raw.revision === live.revision &&
          raw.session?.gameState === "SESSION_COMPLETE"
            ? null
            : undefined,
        { applyLocally: false },
      );
      if (!result.committed) throw Error("تغيّر النشاط؛ أعد المحاولة.");
      if (binding?.sessionId === live.sessionId)
        await runTransaction(
          ref(db, "liveSessionPrivate"),
          (raw) =>
            raw?.sessionId === binding.sessionId &&
            raw.updatedAt === binding.updatedAt
              ? null
              : undefined,
          { applyLocally: false },
        );
    }
  }
  if ((await get(ref(db, "liveSession"))).exists())
    throw Error("يوجد نشاط يحتاج إلى الحفظ أو الاستعادة.");
  await claimControllerLease(db, uid);
}
export async function publishCommand(db: Database, c: VideoCommand) {
  if (!parseCommand(c)) throw Error("أمر غير صالح");
  await get(ref(db, COMMAND_PATH));
  const result = await runTransaction(
    ref(db, COMMAND_PATH),
    (raw) => {
      const old = parseCommand(raw);
      if (
        old &&
        old.controlTabId !== c.controlTabId &&
        old.state !== "stopped" &&
        Date.now() - old.heartbeatAt < 15000
      )
        return;
      if (old && old.sessionId === c.sessionId && old.revision >= c.revision)
        return;
      return c;
    },
    { applyLocally: false },
  );
  if (!result.committed)
    throw Error("التحكم متاح في نافذة أخرى أو تغيّر الأمر.");
}
export async function stopOwnedVideo(db: Database, tab: string) {
  // Keep this node in Firebase's local cache through the transaction. Removing the page's
  // last listener first can otherwise make the callback see null and abort without a server check.
  const target = ref(db, COMMAND_PATH);
  const retain = onValue(
    target,
    () => {},
    () => {},
  );
  try {
    await get(target);
    await runTransaction(
      target,
      (raw) => (raw?.controlTabId === tab ? null : undefined),
      { applyLocally: false },
    );
  } finally {
    retain();
  }
}
export const reportVideoStatus = (db: Database, s: VideoStatus) =>
  update(ref(db, STATUS_PATH), s);
