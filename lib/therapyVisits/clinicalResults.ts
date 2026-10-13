import { onValue, ref, type Unsubscribe } from "firebase/database";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { reviveAnyStoredSession } from "@/lib/sessions/sessionHistoryRepository";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { safeKey } from "./model";

/** Read-only presentation metadata; never written into a saved game result. */
export type ClinicalResult = AnyStoredSession & {
  clinicalLevelsAvailable: boolean;
};
export function reviveClinicalResult(raw: unknown): ClinicalResult | null {
  const result = reviveAnyStoredSession(raw);
  if (!result) return null;
  const original = raw as Record<string, unknown>;
  // Older game readers supply fallback levels for replay compatibility. Those
  // fallbacks must not become recorded clinical facts or comparison criteria.
  const clinicalLevelsAvailable = (
    [
      "startingDifficulty",
      "endingDifficulty",
      "startingStage",
      "endingStage",
    ] as const
  ).every(
    (key) =>
      original[key] !== undefined &&
      original[key] !== null &&
      original[key] === result[key],
  );
  return { ...result, clinicalLevelsAvailable };
}
export function hasRecordedLevels(result: AnyStoredSession): boolean {
  const r = result as AnyStoredSession & { clinicalLevelsAvailable?: boolean };
  return (
    r.clinicalLevelsAvailable ??
    ([r.startingStage, r.endingStage].every(
      (n) => Number.isInteger(n) && Number(n) > 0,
    ) &&
      [r.startingDifficulty, r.endingDifficulty].every((d) =>
        ["EASY", "MEDIUM", "ADVANCED"].includes(d),
      ))
  );
}
export function subscribeClinicalResults(
  patientId: string,
  callback: (records: ClinicalResult[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!safeKey(patientId)) throw Error("مريض غير صالح");
  return onValue(
    ref(getStaffDb(), `sessions/${patientId}`),
    (snapshot) => {
      callback(
        Object.values(snapshot.val() ?? {})
          .map(reviveClinicalResult)
          .filter((r): r is ClinicalResult => !!r && r.patientId === patientId),
      );
    },
    onError,
  );
}
