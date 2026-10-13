import { it, expect } from "vitest";
import { GameState } from "@/lib/game";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { mayEnterBridge } from "../launchGuard";
const record = (gameState: GameState, patientId: string | null = "patient") =>
  ({
    gameId: "balloon-quest",
    sessionId: "foreign-run",
    patientId,
    session: { gameState, sessionId: "foreign-run" },
  }) as LiveSessionRecord;
it("never replaces another activity that is ready, running or paused", () => {
  for (const state of [
    GameState.START_ZONE,
    GameState.PLAYING,
    GameState.STAGE_COMPLETE,
  ])
    expect(mayEnterBridge(record(state), null)).toBe(false);
});
it("requires the exact immutable patient result before replacing an ended activity", () => {
  const live = record(GameState.SESSION_COMPLETE);
  expect(mayEnterBridge(live, null)).toBe(false);
  const saved = {
    gameId: "balloon-quest",
    patientId: "patient",
    sessionId: "foreign-run",
  } as AnyStoredSession;
  expect(mayEnterBridge(live, saved)).toBe(true);
  expect(mayEnterBridge(live, { ...saved, sessionId: "previous-run" })).toBe(
    false,
  );
  expect(mayEnterBridge(record(GameState.SESSION_COMPLETE, null), null)).toBe(
    true,
  );
});
it("delegates the same game to shared owner/patient recovery and accepts an empty channel", () => {
  expect(mayEnterBridge(null, null)).toBe(true);
  expect(
    mayEnterBridge(
      { ...record(GameState.PLAYING), gameId: "balance-bridge-3d" },
      null,
    ),
  ).toBe(true);
});

it("allows an explicit never-started setup, but protects prior progress and unknown records", () => {
  const preview = {
    ...record(GameState.START_ZONE),
    session: {
      gameState: GameState.START_ZONE,
      engine: "bw3",
      bw3: {
        controlTabId: "own",
        payload: JSON.stringify({
          status: "ready",
          startedAt: 0,
          completed: [],
        }),
      },
    },
  } as unknown as LiveSessionRecord;
  expect(mayEnterBridge(preview, null, "own")).toBe(true);
  expect(mayEnterBridge(preview, null, "other")).toBe(false);
  expect(mayEnterBridge(preview, null)).toBe(false);
  expect(
    mayEnterBridge(
      {
        ...preview,
        session: {
          ...preview.session,
          bw3: { payload: JSON.stringify({ status: "ready", startedAt: 42 }) },
        },
      } as unknown as LiveSessionRecord,
      null,
    ),
  ).toBe(false);
});
