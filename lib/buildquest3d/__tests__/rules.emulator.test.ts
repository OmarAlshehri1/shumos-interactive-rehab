/** Emulator-only: hardcoded loopback ports/demo namespace prevent live data writes. */
import { beforeAll, describe, expect, it } from "vitest";
import { action, createState } from "../gameplay";
import { buildQuestLiveSession } from "../cloudState";
import { buildStoredBuildQuestSession } from "../history";
import { STAGES } from "../stages";
import { applyManual, manualCommand } from "../manual";

const DB = `http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? 19000}`, AUTH = `http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? 19099}/identitytoolkit.googleapis.com/v1`;
const NS = "demo-buildquest-default-rtdb";
const enabled = process.env.BUILD_QUEST_EMULATOR === "1";
const runId = Date.now().toString(36);
const admin = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const url = (path: string, token = "") => `${DB}/${path}.json?ns=${NS}${token ? `&auth=${token}` : ""}`;
async function put(path: string, body: unknown, token = "", asAdmin = false) {
  const r = await fetch(url(path, token), { method:"PUT", headers: asAdmin ? admin : { "Content-Type":"application/json" }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
}
async function signup(email?: string) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ ...(email ? {email,password:"password123"} : {}), returnSecureToken:true }) });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j));
  return { uid:j.localId as string, token:j.idToken as string };
}
async function read(path: string, token = "") { const r = await fetch(url(path,token)); return {status:r.status, value:await r.json()}; }
const times = { createdAt: 1000, startedAt: 1500, endedAt: 5000, startingStage: 0 };
const live = (state: ReturnType<typeof createState>, uid: string, revision: number, over: Record<string, unknown> = {}) => ({
  gameId: "build-quest-3d", sessionId: state.session, revision, updatedAt: { ".sv": "timestamp" },
  session: buildQuestLiveSession(state, "اختبار", uid, times, { controlTabId: "tab-1", heartbeatAt: Date.now() }), ...over,
});

describe.skipIf(!enabled)("Build Quest on the shared liveSession: Auth + RTDB emulator security", () => {
  let staff:{uid:string;token:string}, other:{uid:string;token:string}, inactive:{uid:string;token:string}, anonymous:{uid:string;token:string};
  beforeAll(async () => {
    const t = Date.now(); staff = await signup(`bq-owner-${t}@example.test`); other = await signup(`bq-other-${t}@example.test`);
    inactive = await signup(`bq-inactive-${t}@example.test`); anonymous = await signup();
    for (const user of [staff,other]) expect((await put(`staff/${user.uid}`,{active:true,role:"therapist"},"",true)).status).toBe(200);
    expect((await put(`staff/${inactive.uid}`,{active:false,role:"therapist"},"",true)).status).toBe(200);
    expect((await put("patients/bq-test-patient",{patientNumber:"BQTEST",firstName:"اختبار",createdAt:1,updatedAt:1,createdByUid:staff.uid,active:true},"",true)).status).toBe(200);
  });

  it("active staff publish the live record; the anonymous Display may read it; nobody else may write", async () => {
    const s = createState(`emulator-live-${runId}-a`);
    await put("liveSession", null, "", true); // isolated demo namespace: start from an empty record
    const rev = Date.now();
    expect((await put("liveSession", live(s, staff.uid, rev), staff.token)).status).toBe(200);
    expect((await read("liveSession", anonymous.token)).status).toBe(200);
    expect((await read("liveSession")).status).toBe(401);
    for (const token of [anonymous.token, inactive.token, ""]) expect((await put("liveSession", live(s, staff.uid, rev + 1), token)).status).toBe(401);
    expect((await read("liveSession", anonymous.token)).value.gameId).toBe("build-quest-3d");
  });

  it("requires strictly increasing revisions, a child name of 1-30 characters, a registered game id and required session fields", async () => {
    const s = createState(`emulator-live-${runId}-b`);
    await put("liveSession", null, "", true);
    const rev = Date.now() + 1000;
    expect((await put("liveSession", live(s, staff.uid, rev), staff.token)).status).toBe(200);
    expect((await put("liveSession", live(s, staff.uid, rev), staff.token)).status).toBe(401);
    expect((await put("liveSession", live(s, staff.uid, rev - 1), staff.token)).status).toBe(401);
    expect((await put("liveSession", live(s, staff.uid, rev + 1), staff.token)).status).toBe(200);
    const good = live(s, staff.uid, rev + 2);
    const named = (name: string) => ({ ...good, session: { ...good.session, config: { childFirstName: name } } });
    expect((await put("liveSession", named(""), staff.token)).status).toBe(401);
    expect((await put("liveSession", named("x".repeat(31)), staff.token)).status).toBe(401);
    expect((await put("liveSession", { ...good, gameId: "not-a-game" }, staff.token)).status).toBe(401);
    const { currentStage: _drop, ...incomplete } = good.session; void _drop;
    expect((await put("liveSession", { ...good, session: incomplete }, staff.token)).status).toBe(401);
    expect((await put("liveSession", good, staff.token)).status).toBe(200);
  });

  it("a retired dedicated tree is gone: no writes to the old Build Quest paths are possible for anyone", async () => {
    for (const path of ["buildQuest3d/rooms/emulator-old-room", "buildQuest3d/active", "buildQuest3d/patients/emulator-old-room"]) {
      expect((await put(path, { sessionId: "emulator-old-room" }, staff.token)).status, path).toBe(401);
      expect((await read(path, anonymous.token)).status, path).toBe(401);
    }
  });

  it("persists versioned results once, binds them to an existing patient, denies forgery/overwrite and protects private data", async () => {
    const s = action(createState(`emulator-history-${runId}`), "end");
    const rec = buildStoredBuildQuestSession(buildQuestLiveSession(s, "اختبار", staff.uid, times, {}), "bq-test-patient", 0, staff.uid), history = `sessions/bq-test-patient/${s.session}`;
    expect((await put(history,{...rec,resultVersion:2},staff.token)).status).toBe(401);
    expect((await put(history,{...rec,stageResults:[{engine:"wrong",stageId:"first-shapes",difficulty:"EASY",stageNumber:1,status:"COMPLETED",piecesPlaced:0}]},staff.token)).status).toBe(401);
    expect((await put(history,{...rec,stageResults:[{engine:"build3",stageId:"first-shapes",difficulty:"EASY",stageNumber:1,status:"COMPLETED",piecesPlaced:-1}]},staff.token)).status).toBe(401);
    expect((await put(history,{...rec,totalPiecesPlaced:1001},staff.token)).status).toBe(401);
    // Same as every original game: any ACTIVE staff member may create a record for an existing patient, but never in someone else's name.
    expect((await put(history,{...rec,createdByUid:staff.uid},other.token)).status).toBe(401);
    expect((await put(history,{...rec,patientId:"missing-patient"},staff.token)).status).toBe(401);
    expect((await put(`sessions/no-such-patient/${s.session}`,{...rec,patientId:"no-such-patient"},staff.token)).status).toBe(401);
    expect((await put(history,rec,anonymous.token)).status).toBe(401);
    expect((await put(history,rec,inactive.token)).status).toBe(401);
    expect((await put(history,rec,staff.token)).status).toBe(200);
    expect((await put(history,rec,staff.token)).status).toBe(401);
    expect((await read(history,anonymous.token)).status).toBe(401);
    expect((await read(history,staff.token)).value.gameId).toBe("build-quest-3d");
  });

  it("accepts all nine real manual stage results under the strict versioned history schema", async () => {
    let s = createState(`emulator-nine-${runId}`);
    for(const stage of STAGES){s=action(s,"start");for(const p of stage.pieces){s=applyManual(s,manualCommand(s,"select",p.id));s=applyManual(s,manualCommand(s,"place",p.id));}s=action(s,"next");}
    const record=buildStoredBuildQuestSession(buildQuestLiveSession(s,"اختبار",staff.uid,times,{}),"bq-test-patient",0,staff.uid);
    expect(record.stageResults).toHaveLength(9);
    const saved=await put(`sessions/bq-test-patient/${s.session}`,record,staff.token);
    expect(saved.status,saved.text).toBe(200);
  });

  it("preserves launchable games and retired immutable history while rejecting retired live sessions", async () => {
    const metrics:Record<string,object>={
      "balloon-quest":{totalCorrect:1,totalIncorrect:0},"follow-the-footsteps":{totalStepsPresented:1,totalStepsCompleted:1},
      "bubble-pop-wall":{totalTargetsPresented:1,totalTargetsCompleted:1,totalIncorrect:0},"feed-the-animals":{totalRoundsPresented:1,totalRoundsCompleted:1,totalIncorrect:0},
      "space-pilot":{totalStarsPresented:1,totalStarsCollected:1},"color-chase":{totalTargetsPresented:1,totalCorrect:1,totalIncorrect:0,totalDangerPresses:0},
      "runner-quest-3d":{resultVersion:1,totalStars:1,totalHolds:0,totalAssists:0,totalObstaclesPresented:1,totalObstaclesResolved:1},
    };
    await put("liveSession", null, "", true);
    let revision=Date.now()+100000;
    for(const [gameId,m] of Object.entries(metrics)) {
      const sid=`legacy-${gameId}-${Date.now()}`;
      const liveRecord={gameId,sessionId:sid,revision:++revision,updatedAt:{".sv":"timestamp"},session:{sessionId:sid,seed:1,config:{childFirstName:"اختبار"},gameState:"PLAYING",currentDifficulty:"EASY",currentStage:{stageNumber:1},createdAt:1}};
      const result=await put("liveSession",liveRecord,staff.token);expect(result.status,`${gameId}: ${result.text}`).toBe(gameId === "feed-the-animals" ? 401 : 200);
      const record={sessionId:sid,patientId:"bq-test-patient",gameId,startedAt:100,completedAt:200,createdByUid:staff.uid,
        startingDifficulty:"EASY",startingStage:1,endingDifficulty:"EASY",endingStage:1,completedStageCount:1,skippedStageCount:0,...m};
      const path=`sessions/bq-test-patient/${sid}`;
      expect((await put(path,record,staff.token)).status,gameId).toBe(200);
      expect((await put(path,record,staff.token)).status,gameId).toBe(401);
    }
  });
});
