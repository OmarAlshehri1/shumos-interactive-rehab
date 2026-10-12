/** Demo-only isolated ports. No Production addresses, accounts, or writes. */
import { beforeAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { blankEvaluation, type Visit } from "../model";
const db = "http://127.0.0.1:19970",
  auth = "http://127.0.0.1:19979/identitytoolkit.googleapis.com/v1",
  ns = "demo-clinical-visits-default-rtdb";
async function write(
  path: string,
  value: unknown,
  token = "",
  admin = false,
  method = "PUT",
) {
  const r = await fetch(
    `${db}/${path}.json?ns=${ns}${token ? `&auth=${token}` : ""}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(admin ? { Authorization: "Bearer owner" } : {}),
      },
      body: JSON.stringify(value),
    },
  );
  return { status: r.status, body: await r.text() };
}
async function signup(email?: string) {
  const r = await fetch(`${auth}/accounts:signUp?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      returnSecureToken: true,
      ...(email ? { email, password: "ClinicalDemo123!" } : {}),
    }),
  });
  const j = await r.json();
  return { uid: j.localId as string, token: j.idToken as string };
}
describe.skipIf(process.env.CLINICAL_RULES_EMULATOR !== "1")(
  "therapy visit Firebase security",
  () => {
    let staff: Awaited<ReturnType<typeof signup>>,
      other: typeof staff,
      anon: typeof staff,
      v: Visit;
    const update = (patch: Partial<Visit>) => ({
      ...v,
      ...patch,
      revision: v.revision + 1,
      updatedAt: Date.now(),
    });
    const create = (visit: Visit) =>
      write(
        "",
        {
          [`therapyVisits/patient-1/${visit.visitId}`]: visit,
          [`activeTherapyVisits/${staff.uid}`]: {
            patientId: "patient-1",
            visitId: visit.visitId,
            controlTabId: visit.controlTabId,
          },
        },
        staff.token,
        false,
        "PATCH",
      );
    beforeAll(async () => {
      const loaded = await write(
        ".settings/rules",
        JSON.parse(readFileSync("database.rules.json", "utf8")),
        "",
        true,
      );
      expect(loaded.status, loaded.body).toBe(200);
      staff = await signup("clinical-demo@shumos.test");
      other = await signup();
      anon = await signup();
      await write("", null, "", true);
      for (const u of [staff, other])
        await write(
          `staff/${u.uid}`,
          { active: true, role: "therapist" },
          "",
          true,
        );
      for (const id of ["patient-1", "patient-2"])
        await write(
          `patients/${id}`,
          {
            patientNumber: id,
            firstName: "ليلى",
            createdAt: 1,
            updatedAt: 1,
            createdByUid: staff.uid,
            active: true,
          },
          "",
          true,
        );
      const now = Date.now();
      v = {
        version: 1,
        visitId: "visit-1",
        patientId: "patient-1",
        childName: "ليلى",
        ownerUid: staff.uid,
        controlTabId: "clinical-tab",
        title: "جلسة علاج طبيعي",
        therapistName: "معالج تجريبي",
        initialNotes: "",
        finalNotes: "",
        overallRating: null,
        startedAt: now - 1000,
        plannedMs: 45 * 60000,
        pausedMs: 0,
        pausedAt: null,
        endedAt: null,
        revision: 0,
        updatedAt: now,
        entries: {},
        breaks: {},
      };
    });
    it("creates an acknowledged visit atomically with one active visit per staff", async () => {
      const r = await create(v);
      expect(r.status, r.body).toBe(200);
      const second = await create({ ...v, visitId: "visit-2" });
      expect(second.status).toBe(401);
    });
    it("denies public and anonymous reads, allows staff history reads", async () => {
      for (const token of ["", anon.token])
        expect(
          (
            await fetch(
              `${db}/therapyVisits/patient-1.json?ns=${ns}${token ? `&auth=${token}` : ""}`,
            )
          ).status,
        ).toBe(401);
      expect(
        (
          await fetch(
            `${db}/therapyVisits/patient-1.json?ns=${ns}&auth=${staff.token}`,
          )
        ).status,
      ).toBe(200);
    });
    it("rejects foreign writer, identity changes, deletion and invalid ratings", async () => {
      expect(
        (
          await write(
            "therapyVisits/patient-1/visit-1",
            update({}),
            other.token,
          )
        ).status,
      ).toBe(401);
      for (const patch of [
        { patientId: "patient-2" },
        { ownerUid: other.uid },
        { controlTabId: "other-tab" },
        { startedAt: 0 },
        { plannedMs: 0 },
        { overallRating: 6 },
        { overallRating: 2.5 },
        { finalNotes: "x".repeat(2001) },
      ])
        expect(
          (
            await write(
              "therapyVisits/patient-1/visit-1",
              update(patch),
              staff.token,
            )
          ).status,
          JSON.stringify(patch).slice(0, 80),
        ).toBe(401);
      expect(
        (await write("therapyVisits/patient-1/visit-1", null, staff.token))
          .status,
      ).toBe(401);
    });
    it("rejects unconfirmed and cross-patient result references", async () => {
      const now = Date.now(),
        entry = {
          kind: "game" as const,
          sessionId: "result-1",
          gameId: "balloon-quest" as const,
          linkedAt: now,
          evaluation: blankEvaluation(staff.uid, now),
        };
      expect(
        (
          await write(
            "therapyVisits/patient-1/visit-1",
            update({ entries: { "result-1": entry } }),
            staff.token,
          )
        ).status,
      ).toBe(401);
      await write(
        "sessions/patient-2/result-1",
        {
          sessionId: "result-1",
          patientId: "patient-2",
          gameId: "balloon-quest",
          startedAt: v.startedAt,
          createdByUid: staff.uid,
        },
        "",
        true,
      );
      expect(
        (
          await write(
            "visitResultClaims/patient-1/result-1",
            "visit-1",
            staff.token,
          )
        ).status,
      ).toBe(401);
    });
    it("links confirmed history with an immutable claim and edits a separate unrated evaluation", async () => {
      const now = Date.now();
      await write(
        "sessions/patient-1/result-1",
        {
          sessionId: "result-1",
          patientId: "patient-1",
          gameId: "balloon-quest",
          startedAt: v.startedAt,
          createdByUid: staff.uid,
        },
        "",
        true,
      );
      expect(
        (
          await write(
            "visitResultClaims/patient-1/result-1",
            "visit-1",
            staff.token,
          )
        ).status,
      ).toBe(200);
      expect(
        (await write("visitResultClaims/patient-1/result-1", null, staff.token))
          .status,
      ).toBe(401);
      expect(
        (
          await write(
            "visitResultClaims/patient-1/result-1",
            "visit-2",
            staff.token,
          )
        ).status,
      ).toBe(401);
      const next = update({
        entries: {
          "result-1": {
            kind: "game",
            sessionId: "result-1",
            gameId: "balloon-quest",
            linkedAt: now,
            evaluation: blankEvaluation(staff.uid, now),
          },
        },
      });
      const r = await write(
        "therapyVisits/patient-1/visit-1",
        next,
        staff.token,
      );
      expect(r.status, r.body).toBe(200);
      v = next;
      const changed = update({
        entries: {
          "result-1": {
            ...v.entries["result-1"],
            evaluation: {
              ...blankEvaluation(staff.uid, Date.now()),
              rating: 0,
              assistance: "partial",
              notes: "ملاحظة المعالج",
            },
          },
        },
      });
      const edited = await write(
        "therapyVisits/patient-1/visit-1",
        changed,
        staff.token,
      );
      expect(edited.status, edited.body).toBe(200);
      v = changed;
    });
    it("rejects stale revisions and undeclared clinical fields; finishes once and preserves elapsed time", async () => {
      expect(
        (
          await write(
            "therapyVisits/patient-1/visit-1",
            { ...v, finalNotes: "stale" },
            staff.token,
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await write(
            "therapyVisits/patient-1/visit-1",
            { ...update({}), publicPatientId: "leak" },
            staff.token,
          )
        ).status,
      ).toBe(401);
      const ended = update({ endedAt: Date.now(), finalNotes: "تمت المراجعة" });
      const r = await write(
        "therapyVisits/patient-1/visit-1",
        ended,
        staff.token,
      );
      expect(r.status, r.body).toBe(200);
      v = ended;
      expect(
        (
          await write(
            "therapyVisits/patient-1/visit-1",
            update({ endedAt: null }),
            staff.token,
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await create({
            ...v,
            visitId: "visit-next",
            revision: 0,
            endedAt: null,
            entries: {},
            startedAt: Date.now(),
            updatedAt: Date.now(),
          })
        ).status,
      ).toBe(200);
    });
  },
);
