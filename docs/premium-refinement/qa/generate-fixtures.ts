/** Pure synthetic native-engine fixture; used only by local demo screenshot QA. */
import { writeFileSync } from "node:fs";
import { createState, reduce } from "../../../lib/bubblepopwall3d/engine";
import { makeLive } from "../../../lib/bubblepopwall3d/live";
import { GAME_REGISTRY } from "../../../lib/games/registry";
let state = reduce(createState("premium-dome-capture"), {
  type: "stage",
  stage: 2,
});
state = reduce(state, {
  type: "configure",
  config: {
    targetSize: 0.2,
    highContrast: true,
    reducedMotion: true,
    sound: false,
  },
});
const ready = state;
state = reduce(state, { type: "start", at: Date.now() });
const fixture = {
  games: GAME_REGISTRY.map((g) => ({
    id: g.id,
    route: g.route,
    name: g.nameAr,
  })),
  dome: {
    gameId: "bubble-pop-wall",
    sessionId: state.sessionId,
    revision: 1,
    updatedAt: Date.now(),
    session: makeLive(state, "premium-fixture", "صديقي", {
      controlTabId: "premium-fixture-tab",
      heartbeatAt: Date.now(),
    }),
  },
  domeReady: {
    gameId: "bubble-pop-wall",
    sessionId: ready.sessionId,
    revision: 2,
    updatedAt: Date.now(),
    session: makeLive(ready, "premium-fixture", "صديقي", {
      controlTabId: "premium-fixture-tab",
      heartbeatAt: Date.now(),
    }),
  },
  domeState: state,
};
writeFileSync(
  "/tmp/shumos-premium-fixtures.json",
  JSON.stringify(fixture, null, 2),
);
