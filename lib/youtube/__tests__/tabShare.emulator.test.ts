import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const db = "http://127.0.0.1:19940", ns = "demo-shumos-security-default-rtdb";
const endpoint = (path: string) => `${db}/${path}.json?ns=${ns}`;
async function admin(path: string, value: unknown) {
  const r = await fetch(endpoint(path), { method: "PUT", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify(value) });
  if (!r.ok) throw Error(`Synthetic fixture: ${r.status}`);
}
async function signup() {
  const r = await fetch("http://127.0.0.1:19949/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
  const value = await r.json(); return { uid: value.localId as string, token: value.idToken as string };
}
type Actor = Awaited<ReturnType<typeof signup>>;
let owner: Actor, other: Actor, display: Actor, outsider: Actor;
async function request(path: string, actor: Actor, method = "GET", value?: unknown) {
  return fetch(`${endpoint(path)}&auth=${actor.token}`, { method, ...(value === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }) });
}
const offer = () => ({ sessionId: "share-1", ownerId: owner.uid, controlTabId: "control-1", displayUid: display.uid, displayInstance: "display-window", createdAt: { ".sv": "timestamp" }, expiresAt: Date.now() + 30000, hidden: false, offer: "v=0\r\no=synthetic\r\n" });
const grant = () => ({ approvedBy: owner.uid, issuedAt: Date.now(), expiresAt: Date.now() + 60000 });

describe.skipIf(process.env.DISPLAY_SECURITY_EMULATOR !== "1")("Native tab sharing authorization (synthetic loopback only)", () => {
  beforeAll(async () => {
    [owner, other, display, outsider] = await Promise.all([signup(), signup(), signup(), signup()]);
    await admin(".settings/rules", JSON.parse(readFileSync("database.rules.json", "utf8")));
  });
  beforeEach(async () => {
    await admin("", { staff: { [owner.uid]: { active: true, role: "therapist" }, [other.uid]: { active: true, role: "therapist" } }, controllerLease: { ownerId: owner.uid, claimedAt: Date.now(), updatedAt: Date.now() }, presence: { displayAccess: { [display.uid]: grant() } } });
  });
  it("requires active staff, current lease and an approved target", async () => {
    expect((await request("youtubeTabShare", outsider, "PUT", offer())).status).toBe(401);
    expect((await request("youtubeTabShare", other, "PUT", { ...offer(), ownerId: other.uid })).status).toBe(401);
    await admin("controllerLease", null);
    expect((await request("youtubeTabShare", owner, "PUT", offer())).status).toBe(401);
    await admin("controllerLease", { ownerId: owner.uid });
    await admin(`presence/displayAccess/${display.uid}`, null);
    expect((await request("youtubeTabShare", owner, "PUT", offer())).status).toBe(401);
  });
  it("allows only the owner and addressed Display to read signaling", async () => {
    expect((await request("youtubeTabShare", owner, "PUT", offer())).status).toBe(200);
    expect((await request("youtubeTabShare", owner)).status).toBe(200);
    expect((await request("youtubeTabShare", display)).status).toBe(200);
    expect((await request("youtubeTabShare", other)).status).toBe(401);
    await admin(`presence/displayAccess/${outsider.uid}`, grant());
    expect((await request("youtubeTabShare", outsider)).status).toBe(401);
  });
  it("binds answers and playback to the current offer; rejects duplicate/stale answers", async () => {
    await request("youtubeTabShare", owner, "PUT", offer());
    const answer = { sessionId: "share-1", sdp: "v=0\r\no=answer\r\n" };
    expect((await request("youtubeTabShare/answer", outsider, "PUT", answer)).status).toBe(401);
    expect((await request("youtubeTabShare/answer", display, "PUT", { ...answer, sessionId: "old-share" })).status).toBe(401);
    expect((await request("youtubeTabShare/answer", display, "PUT", answer)).status).toBe(200);
    expect((await request("youtubeTabShare/answer", display, "PUT", answer)).status).toBe(401);
    expect((await request("youtubeTabShare/playback", display, "PUT", { sessionId: "old-share", state: "playing" })).status).toBe(401);
    expect((await request("youtubeTabShare/playback", display, "PUT", { sessionId: "share-1", state: "playing" })).status).toBe(200);
    expect((await request("youtubeTabShare/hidden", display, "PUT", true)).status).toBe(401);
  });
  it("protects live gameplay and rejects signaling media fields and oversized SDP", async () => {
    await admin("liveSession", { sessionId: "synthetic-unsaved", session: { gameState: "PLAYING" } });
    expect((await request("youtubeTabShare", owner, "PUT", offer())).status).toBe(401);
    await admin("liveSession", null);
    expect((await request("youtubeTabShare", owner, "PUT", { ...offer(), frames: "not-a-media-transport" })).status).toBe(401);
    expect((await request("youtubeTabShare", owner, "PUT", { ...offer(), offer: "v=0\r\n" + "x".repeat(20000) })).status).toBe(401);
  });
  it("supports owner hide/restore while preventing another Control window from replacing a live share", async () => {
    await request("youtubeTabShare", owner, "PUT", offer());
    expect((await request("youtubeTabShare", owner, "PATCH", { hidden: true, expiresAt: Date.now() + 30000 })).status).toBe(200);
    expect((await request("youtubeTabShare", owner, "PATCH", { hidden: false, expiresAt: Date.now() + 30000 })).status).toBe(200);
    expect((await request("youtubeTabShare", owner, "PUT", { ...offer(), sessionId: "new-share", controlTabId: "another-window" })).status).toBe(401);
    expect((await request("youtubeTabShare/offer", owner, "PUT", "v=0\r\no=replaced\r\n")).status).toBe(401);
  });
  it("revokes access on lease loss or expired/revoked approval and permits safe deletion", async () => {
    await request("youtubeTabShare", owner, "PUT", offer());
    await admin("controllerLease/ownerId", other.uid);
    expect((await request("youtubeTabShare", display)).status).toBe(401);
    expect((await request("youtubeTabShare/playback", display, "PUT", { sessionId: "share-1", state: "playing" })).status).toBe(401);
    await admin("controllerLease/ownerId", owner.uid);
    await admin(`presence/displayAccess/${display.uid}`, { ...grant(), expiresAt: 1 });
    expect((await request("youtubeTabShare", display)).status).toBe(401);
    expect((await request("youtubeTabShare", display, "DELETE")).status).toBe(200);
  });
  it("bounds lifetime and rejects inactive staff", async () => {
    expect((await request("youtubeTabShare", owner, "PUT", { ...offer(), expiresAt: Date.now() + 120000 })).status).toBe(401);
    await admin(`staff/${owner.uid}/active`, false);
    expect((await request("youtubeTabShare", owner, "PUT", offer())).status).toBe(401);
  });
});
