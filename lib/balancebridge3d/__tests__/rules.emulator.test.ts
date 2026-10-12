import { beforeAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createState, reduce } from "../engine";
import { makeLive } from "../live";
import { buildHistory } from "../history";
const db = "http://127.0.0.1:19940",
  auth = "http://127.0.0.1:19949/identitytoolkit.googleapis.com/v1",
  ns = "demo-balance-rules-default-rtdb";
async function put(path: string, value: unknown, token = "", admin = false) {
  const r = await fetch(
    `${db}/${path}.json?ns=${ns}${token ? `&auth=${token}` : ""}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(admin ? { Authorization: "Bearer owner" } : {}),
      },
      body: JSON.stringify(value),
    },
  );
  return r.status;
}
async function signup() {
  const r = await fetch(auth + "/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const v = await r.json();
  return { uid: v.localId as string, token: v.idToken as string };
}
describe.skipIf(process.env.BALANCE_RULES_EMULATOR !== "1")(
  "Balance Bridge candidate rules, loopback demo only",
  () => {
    let staff: Awaited<ReturnType<typeof signup>>,
      other: typeof staff,
      anon: typeof staff;
    let revision = 0;
    const record = (uid = staff.uid) => {
      const s = createState("rules-live");
      return {
        gameId: "balance-bridge-3d",
        sessionId: s.sessionId,
        revision: ++revision,
        updatedAt: Date.now(),
        session: makeLive(s, uid, "طفل", {
          controlTabId: "rules-tab",
          heartbeatAt: Date.now(),
        }),
      };
    };
    beforeAll(async () => {
      expect(
        await put(
          ".settings/rules",
          JSON.parse(
            readFileSync(
              "docs/balancebridge3d/CANDIDATE_DATABASE_RULES.json",
              "utf8",
            ),
          ),
          "",
          true,
        ),
      ).toBe(200);
      staff = await signup();
      other = await signup();
      anon = await signup();
      for (const user of [staff, other])
        expect(await put("staff/" + user.uid, { active: true }, "", true)).toBe(
          200,
        );
      await put(
        "controllerLease",
        { ownerId: staff.uid, claimedAt: 1, updatedAt: Date.now() },
        "",
        true,
      );
      await put(
        "patients/rules-patient",
        {
          patientNumber: "RULES",
          firstName: "طفل",
          active: true,
          createdAt: 1,
          updatedAt: 1,
          createdByUid: staff.uid,
        },
        "",
        true,
      );
      await put("liveSession", null, "", true);
      await put("sessions/rules-patient", null, "", true);
    });
    it("allows the staff owner and rejects anonymous, unauthorized, forged ownership and invalid schema", async () => {
      expect(await put("liveSession", record(), staff.token)).toBe(200);
      expect(await put("liveSession", record())).toBe(401);
      expect(await put("liveSession", record(anon.uid), anon.token)).toBe(401);
      expect(await put("liveSession", record(other.uid), other.token)).toBe(
        401,
      );
      const invalid = record();
      invalid.session.engineVersion = 2 as 1;
      expect(await put("liveSession", invalid, staff.token)).toBe(401);
      const oversized = record();
      oversized.session.bb3.payload = "x".repeat(32769);
      expect(await put("liveSession", oversized, staff.token)).toBe(401);
    });
    it("rejects duplicate revision and competing Control tab even with a new session ID", async () => {
      const v = record();
      expect(await put("liveSession", v, staff.token)).toBe(200);
      expect(await put("liveSession", v, staff.token)).toBe(401);
      const otherTab = record();
      otherTab.session.bb3.controlTabId = "other-tab";
      expect(await put("liveSession", otherTab, staff.token)).toBe(401);
      otherTab.revision = ++revision;
      otherTab.sessionId = "forged";
      otherTab.session = makeLive(createState("forged"), staff.uid, "طفل", {
        controlTabId: "other-tab",
        heartbeatAt: Date.now(),
      });
      expect(await put("liveSession", otherTab, staff.token)).toBe(401);
    });
    it("saves one immutable result, rejects forged metrics and protects history from anonymous reads", async () => {
      const s = reduce(createState("rules-history"), {
        type: "end",
        at: Date.now(),
      });
      const h = buildHistory(s, "rules-patient", staff.uid);
      expect(
        await put("sessions/rules-patient/" + h.sessionId, h, staff.token),
      ).toBe(200);
      expect(
        await put("sessions/rules-patient/" + h.sessionId, h, staff.token),
      ).toBe(401);
      expect(
        await put(
          "sessions/rules-patient/bad",
          { ...h, sessionId: "bad", assistedCheckpoints: 99 },
          staff.token,
        ),
      ).toBe(401);
      expect(
        (
          await fetch(
            `${db}/sessions/rules-patient.json?ns=${ns}&auth=${anon.token}`,
          )
        ).status,
      ).toBe(401);
    });
  },
);
