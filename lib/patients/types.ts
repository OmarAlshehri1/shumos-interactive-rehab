import type { Difficulty, StageNumber } from "@/lib/game";

/**
 * PATIENT REGISTRY FOUNDATION — the permanent clinic patient record. Kept
 * deliberately minimal (see database.rules.json's matching `patients/$patientId`
 * schema, which rejects any extra field via `$other: false`): no diagnosis,
 * medical notes, phone, DOB, or parent information. Separate from
 * `liveSession` (lib/realtime/types.ts) — a patient record is permanent
 * clinic data; a live session is one transient game round. Session history
 * linking these two is explicitly the NEXT task, not this one.
 */
export interface Patient {
  patientId: string;
  /** The clinic's own identifier (e.g. "1024") — NOT the Firebase key. Normalized (see patientRepository.ts's normalizePatientNumber) and immutable after creation; see database.rules.json. */
  patientNumber: string;
  firstName: string;
  createdAt: number;
  updatedAt: number;
  createdByUid: string;
  active: boolean;
}

/**
 * The small, closed set of failure reasons the patient repository ever
 * throws — never a raw Firebase error code, same pattern as
 * lib/realtime/staffAuthClient.ts's StaffSignInError. UI layers map these to
 * Arabic copy; see components/control/patients/patientErrorCopy.ts.
 */
export type PatientRepositoryError = "invalid-name" | "invalid-number" | "duplicate-number" | "network" | "unknown";

export class PatientRepositoryException extends Error {
  code: PatientRepositoryError;
  constructor(code: PatientRepositoryError) {
    super(code);
    this.name = "PatientRepositoryException";
    this.code = code;
  }
}

/**
 * The minimal patient context a therapist carries from the Patient Profile
 * into the Game Library and a game's setup screen — see
 * lib/patients/PatientSessionContext.tsx. Deliberately just these fields:
 * `patientNumber` never leaves this in-memory/sessionStorage context (see
 * the report's "Display privacy" section) — it's here only so
 * lib/control/useRealtimeControllerSession.ts can pin `patientId` onto a
 * new session at creation time (see LiveSessionRecord.patientId's doc
 * comment) without a second Firebase round trip.
 */
export interface SelectedPatientContext {
  patientId: string;
  patientNumber: string;
  firstName: string;
  /**
   * SESSION HISTORY TASK — set only when the therapist pressed "متابعة من
   * آخر تقدم" on the Patient Profile (see lib/sessions/resumeSuggestion.ts);
   * omitted/undefined for a plain "بدء جلسة جديدة." Consumed exactly once by
   * usePatientPrefill to prefill the setup screen's difficulty/starting
   * stage, the same "never overwrite what the therapist already touched"
   * guard firstName prefill uses.
   */
  resumeSuggestion?: { difficulty: Difficulty; startingStage: StageNumber } | null;
}
