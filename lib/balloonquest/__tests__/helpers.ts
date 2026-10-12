import { balloonTop, heightCqh, widthCqw } from "../geometry";
import { createSession, selectBalloon, selectableBodies, startSession, tickSession, type CreateParams } from "../session";
import { usefulTargetCount } from "../spawner";
import type { Session } from "../types";

export const make = (over: Partial<CreateParams> = {}): Session => startSession(createSession({ sessionId: "t", sessionEpoch: 1, seed: 42, ...over }));

export function advanceMs(s: Session, ms: number, step = 16): Session {
  let session = s;
  for (let t = 0; t < ms; t += step) session = tickSession(session, step);
  return session;
}

/** Selects the first selectable target-coloured balloon, if any. */
export function popTarget(s: Session): Session {
  const stage = s.stage!;
  const body = selectableBodies(s).find((b) => stage.balloons.find((x) => x.id === b.id)!.color === stage.target);
  return body ? selectBalloon(s, { balloonId: body.id, source: "KEYBOARD" }).session : s;
}

export function overlapCount(s: Session): number {
  const stage = s.stage!;
  const w = widthCqw(stage.spec.sizeCqh);
  const h = heightCqh(stage.spec.sizeCqh);
  const b = stage.balloons;
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    for (let j = i + 1; j < b.length; j++) {
      const dy = Math.abs(balloonTop(b[i], stage.spec, stage.simTimeMs) - balloonTop(b[j], stage.spec, stage.simTimeMs));
      if (Math.abs(b[i].x - b[j].x) < w && dy < h) n++;
    }
  }
  return n;
}

export const targetsAvailable = (s: Session) => usefulTargetCount(s.stage!.balloons, s.stage!.target, s.stage!.spec, s.stage!.simTimeMs);
