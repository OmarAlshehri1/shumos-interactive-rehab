/** Local synthetic records only; never a production endpoint. */
import { beforeAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { allocationPatch, parseNumbering } from "../numbering";
import { visitFixture } from "./visitFixture";
const on = process.env.VISIT_NUMBERING_EMULATOR === "1",
  DB = "http://127.0.0.1:19940",
  AUTH = "http://127.0.0.1:19949",
  NS = "demo-visit-history-default-rtdb";
const url = (p: string, t = "") =>
  `${DB}/${p}.json?ns=${NS}${t ? "&auth=" + t : ""}`;
async function write(
  p: string,
  v: unknown,
  t = "",
  admin = false,
  method = "PUT",
) {
  return (
    await fetch(url(p, t), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(admin ? { Authorization: "Bearer owner" } : {}),
      },
      body: JSON.stringify(v),
    })
  ).status;
}
async function read(p: string, t = "") {
  const r = await fetch(url(p, t));
  return { status: r.status, value: r.ok ? await r.json() : null };
}
async function signup(email?: string) {
  const r = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(email ? { email, password: "LocalVisit123!" } : {}),
        returnSecureToken: true,
      }),
    },
  );
  const b = await r.json();
  return { uid: b.localId as string, token: b.idToken as string };
}
describe.skipIf(!on)(
  "immutable visit numbering + existing clinical permissions",
  () => {
    let staff: { uid: string; token: string },
      other: typeof staff,
      anon: typeof staff,
      inactive: typeof staff;
    beforeAll(async () => {
      await write(
        ".settings/rules",
        JSON.parse(readFileSync("database.rules.json", "utf8")),
        "",
        true,
      );
      await write("", null, "", true);
      const t = Date.now();
      staff = await signup(`history-${t}@example.test`);
      other = await signup(`history-other-${t}@example.test`);
      anon = await signup();
      inactive = await signup(`history-inactive-${t}@example.test`);
      for (const s of [staff, other])
        await write(
          `staff/${s.uid}`,
          { active: true, role: "therapist" },
          "",
          true,
        );
      await write(
        `staff/${inactive.uid}`,
        { active: false, role: "therapist" },
        "",
        true,
      );
    });
    for (const size of [1, 6, 8, 12, 20])
      it(`numbers ${size} real legacy visits sequentially and survives title/evaluation edits`, async () => {
        const p = `p${size}`,
          now = Date.now() - 300000;
        await write(
          `patients/${p}`,
          {
            patientNumber: p,
            firstName: "طفل اختباري",
            createdAt: now,
            updatedAt: now,
            createdByUid: staff.uid,
            active: true,
          },
          "",
          true,
        );
        for (let i = 1; i <= size; i++)
          await write(
            `therapyVisits/${p}/v${i}`,
            {
              ...visitFixture(`v${i}`, now + i),
              patientId: p,
              ownerUid: i % 2 ? staff.uid : other.uid,
              entries: {},
            },
            "",
            true,
          );
        for (let i = 1; i <= size; i++) {
          const index = parseNumbering(
            (await read(`therapyVisits/${p}/_numbering`, staff.token)).value,
          );
          expect(
            await write(
              "",
              allocationPatch(p, `v${i}`, index),
              staff.token,
              false,
              "PATCH",
            ),
          ).toBe(200);
        }
        const index = (await read(`therapyVisits/${p}/_numbering`, staff.token))
          .value;
        expect(index.byVisit.v1).toBe("1");
        expect(index.byVisit[`v${size}`]).toBe(String(size));
        const v = (await read(`therapyVisits/${p}/v1`, staff.token)).value;
        expect(
          await write(
            `therapyVisits/${p}/v1`,
            {
              ...v,
              title: "عنوان معدل",
              overallRating: 4,
              finalNotes: "ملاحظة المعالج",
              revision: v.revision + 1,
              updatedAt: Date.now(),
            },
            staff.token,
          ),
        ).toBe(200);
        expect(
          (await read(`therapyVisits/${p}/_numbering`, staff.token)).value,
        ).toEqual(index);
      });
    it("denies unauthorized numbering/patient/visit reads and writes", async () => {
      for (const token of [anon.token, inactive.token, ""]) {
        expect((await read("therapyVisits/p1", token)).status).toBe(401);
        expect(
          await write(
            "",
            allocationPatch("p1", "v2", parseNumbering(null)),
            token,
            false,
            "PATCH",
          ),
        ).toBe(401);
      }
      const v = (await read("therapyVisits/p1/v1", staff.token)).value;
      expect(
        await write(
          "therapyVisits/p1/v1",
          { ...v, finalNotes: "unauthorized", revision: v.revision + 1 },
          other.token,
        ),
      ).toBe(401);
    });
    it("rejects duplicate numbers, phantom reservations, renumbering, mapping deletion and whole-index replacement", async () => {
      expect(
        await write("therapyVisits/p1/_numbering/byVisit/v1", "2", staff.token),
      ).toBe(401);
      expect(
        await write(
          "therapyVisits/p1/_numbering/byVisit/v1",
          null,
          staff.token,
        ),
      ).toBe(401);
      expect(
        await write("therapyVisits/p1/_numbering", null, staff.token),
      ).toBe(401);
      const index = parseNumbering(
        (await read("therapyVisits/p1/_numbering", staff.token)).value,
      );
      expect(
        await write(
          "",
          allocationPatch("p1", "phantom", index),
          staff.token,
          false,
          "PATCH",
        ),
      ).toBe(401);
      const replace = {
        lastNumber: 2,
        lastVisitId: "v1",
        byVisit: { v1: "2" },
        byNumber: { 2: "v1" },
      };
      expect(
        await write("therapyVisits/p1/_numbering", replace, staff.token),
      ).toBe(401);
    });
    it("creates a new visit, number and active pointer atomically; a stale writer cannot steal the number", async () => {
      const index = parseNumbering(
          (await read("therapyVisits/p1/_numbering", staff.token)).value,
        ),
        id = "new-visit";
      const v = {
        ...visitFixture(id, Date.now()),
        patientId: "p1",
        ownerUid: staff.uid,
        endedAt: null,
        entries: {},
        updatedAt: Date.now(),
      };
      const patch = {
        ...allocationPatch("p1", id, index),
        [`therapyVisits/p1/${id}`]: v,
        [`activeTherapyVisits/${staff.uid}`]: {
          patientId: "p1",
          visitId: id,
          controlTabId: v.controlTabId,
        },
      };
      expect(await write("", patch, staff.token, false, "PATCH")).toBe(200);
      expect(
        await write(
          "",
          allocationPatch("p1", "v1", index),
          staff.token,
          false,
          "PATCH",
        ),
      ).toBe(401);
      expect(
        (await read("therapyVisits/p1/_numbering", staff.token)).value.byVisit[
          id
        ],
      ).toBe("2");
    });
    it("cannot overwrite/delete immutable patient game results", async () => {
      const p = "p1",
        id = "result",
        t = Date.now() - 60000;
      const r = {
        sessionId: id,
        patientId: p,
        gameId: "balloon-quest",
        createdByUid: staff.uid,
        startedAt: t,
        completedAt: t + 30000,
        startingDifficulty: "EASY",
        startingStage: 1,
        endingDifficulty: "EASY",
        endingStage: 1,
        completedStageCount: 1,
        skippedStageCount: 0,
        totalCorrect: 5,
        totalIncorrect: 1,
      };
      expect(await write(`sessions/${p}/${id}`, r, staff.token)).toBe(200);
      expect(
        await write(
          `sessions/${p}/${id}`,
          { ...r, totalCorrect: 999 },
          staff.token,
        ),
      ).toBe(401);
      expect(await write(`sessions/${p}/${id}`, null, staff.token)).toBe(401);
    });
  },
);
