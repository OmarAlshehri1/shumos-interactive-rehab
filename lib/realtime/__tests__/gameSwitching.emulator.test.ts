import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.hoisted(() => vi.stubEnv("NEXT_PUBLIC_BALANCE_BRIDGE_3D", "true"));
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, get, ref } from "firebase/database";
import { createState, reduce } from "@/lib/balancebridge3d/engine";
import { makeLive } from "@/lib/balancebridge3d/live";
import { clearOwnedLiveSession, discardUnstartedPreview, fetchLiveSession, publishSession } from "../sessionRepository";
import { isUnstartedActivity, ownsUnstartedActivity } from "@/lib/therapyVisits/gameSafety";

const enabled = process.env.GAME_SWITCHING_EMULATOR === "1";
const ns = "demo-shumos-switching-default-rtdb";
const app = initializeApp({ apiKey: "fake", projectId: "demo-shumos-switching", databaseURL: `https://${ns}.firebaseio.com` }, "game-switching-test");
const auth = getAuth(app), db = getDatabase(app);
let uid: string;
async function admin(path: string, value: unknown) {
  const response = await fetch(`http://127.0.0.1:19940/${path}.json?ns=${ns}`, {
    method: "PUT", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify(value),
  });
  if (!response.ok) throw Error(`Synthetic fixture failed: ${response.status}`);
}
async function setup(id: string, tab = "tab", started = false) {
  let state = createState(id);
  if (started) state = reduce(state, { type: "start" });
  const session = makeLive(state, uid, "Synthetic", { controlTabId: tab, heartbeatAt: Date.now() });
  await publishSession(db, { gameId: "balance-bridge-3d", sessionId: id, revision: Date.now(), session, patientId: "synthetic", lastInteraction: null });
}
describe.skipIf(!enabled)("safe empty game replacement", () => {
  beforeAll(async () => {
    connectAuthEmulator(auth, "http://127.0.0.1:19949", { disableWarnings: true });
    connectDatabaseEmulator(db, "127.0.0.1", 19940);
    const email = `switch-${Date.now()}@example.test`, password = "SyntheticTest123!";
    const response = await fetch("http://127.0.0.1:19949/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    uid = (await response.json()).localId;
    await admin("", { staff: { [uid]: { active: true, role: "therapist" } }, controllerLease: { ownerId: uid, updatedAt: Date.now(), claimedAt: Date.now() } });
    await admin(".settings/rules", JSON.parse(readFileSync("database.rules.json", "utf8")));
    await signInWithEmailAndPassword(auth, email, password);
  });
  afterAll(async () => { await deleteApp(app); vi.unstubAllEnvs(); });
  it("retires an owned empty setup and its private binding without writing history", async () => {
    await setup("empty");
    const live = await fetchLiveSession(db);
    expect(live).not.toBeNull();
    expect(isUnstartedActivity(live)).toBe(true);
    expect(ownsUnstartedActivity(live!, "tab", uid)).toBe(true);
    expect(await discardUnstartedPreview(db, "empty", "tab")).toBe(true);
    expect(await fetchLiveSession(db)).toBeNull();
    expect((await get(ref(db, "liveSessionPrivate"))).exists()).toBe(false);
    expect((await get(ref(db, "sessions/synthetic"))).exists()).toBe(false);
  });
  it("a delayed old teardown cannot erase the new game or its patient binding", async () => {
    await setup("new-setup");
    const before = (await get(ref(db, "liveSessionPrivate"))).val();
    expect(await clearOwnedLiveSession(db, "old-setup")).toBe(false);
    expect(await discardUnstartedPreview(db, "old-setup", "tab")).toBe(false);
    expect((await fetchLiveSession(db))?.sessionId).toBe("new-setup");
    expect((await get(ref(db, "liveSessionPrivate"))).val()).toEqual(before);
  });
  it("does not retire another window's empty preview", async () => {
    await admin("liveSession", null);
    await admin("liveSessionPrivate", null);
    await setup("other-window", "other-tab");
    expect(await discardUnstartedPreview(db, "other-window", "tab")).toBe(false);
    expect((await fetchLiveSession(db))?.sessionId).toBe("other-window");
  });
  it("a Start that wins the transaction race makes preview deletion abort", async () => {
    await admin("liveSession", null);
    await admin("liveSessionPrivate", null);
    await setup("started", "tab", true);
    const before = (await get(ref(db, "liveSession"))).val();
    expect(await discardUnstartedPreview(db, "started", "tab")).toBe(false);
    expect((await get(ref(db, "liveSession"))).val()).toEqual(before);
  });
  it("rejects cleanup after Firebase staff sign-out", async () => {
    await auth.signOut();
    expect(await clearOwnedLiveSession(db, "started")).toBe(false);
  });
});
