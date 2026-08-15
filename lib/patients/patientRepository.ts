import { get, onValue, push, ref, update, type Unsubscribe } from "firebase/database";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { PatientRepositoryException, type Patient, type PatientRepositoryError } from "./types";

/**
 * PATIENT REGISTRY FOUNDATION — the dedicated Firebase data layer for
 * permanent patient records. Same "UI never touches firebase/database
 * directly" architecture as lib/realtime/sessionRepository.ts: every
 * component goes through the functions below, never `ref`/`get`/`update`
 * itself. Deliberately its own file/module (not folded into
 * lib/realtime/sessionRepository.ts) — patients are clinic data, not live
 * gameplay data, and the two must stay easy to reason about independently
 * (see database.rules.json's separate `patients`/`patientNumbers` trees).
 */

const PATIENTS_PATH = "patients";
const PATIENT_NUMBERS_PATH = "patientNumbers";

const MAX_NAME_LENGTH = 50;
const MAX_NUMBER_LENGTH = 40;

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (ch) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (arabicIndex !== -1) return String(arabicIndex);
    const persianIndex = PERSIAN_DIGITS.indexOf(ch);
    return persianIndex !== -1 ? String(persianIndex) : ch;
  });
}

/**
 * The lookup-key form of a clinic patient number: trimmed, Arabic-Indic/
 * Persian digits folded to ASCII (so "١٠٢٤" and "1024" collide as the SAME
 * clinic number — a real risk in a bilingual clinic), and internal
 * whitespace collapsed away. This exact string is both the uniqueness key
 * (`patientNumbers/{normalized}`) and what's stored on the patient record —
 * see the report's "Patient-number uniqueness strategy."
 */
export function normalizePatientNumber(raw: string): string {
  return normalizeDigits(raw.trim()).replace(/\s+/g, "");
}

// RTDB keys can't contain '.', '#', '$', '[', ']', '/', or whitespace/control
// characters — this is also a reasonable, closed charset for a clinic id.
const SAFE_NUMBER_PATTERN = /^[\p{L}\p{N}_-]+$/u;

function validatePatientNumber(normalized: string): PatientRepositoryError | null {
  if (normalized.length === 0 || normalized.length > MAX_NUMBER_LENGTH) return "invalid-number";
  if (!SAFE_NUMBER_PATTERN.test(normalized)) return "invalid-number";
  return null;
}

function validateFirstName(trimmed: string): PatientRepositoryError | null {
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return "invalid-name";
  return null;
}

function mapUnknownError(error: unknown): PatientRepositoryError {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  const code = (error as { code?: string } | null)?.code ?? "";
  if (code === "PERMISSION_DENIED") return "unknown";
  return "unknown";
}

function toPatient(patientId: string, value: Omit<Patient, "patientId"> | null): Patient | null {
  if (!value) return null;
  return { patientId, ...value };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Live-subscribes to every patient record. The clinic sees ~10-15 patients/
 * month (see the task's PRODUCT GOAL), so loading the whole node and
 * filtering/searching client-side (see components/control/patients/usePatients.ts)
 * is the simplest correct approach — no pagination, no server-side query
 * indexing needed at this scale.
 */
export function subscribeToPatients(callback: (patients: Patient[]) => void): Unsubscribe {
  const db = getStaffDb();
  return onValue(ref(db, PATIENTS_PATH), (snapshot) => {
    const value = (snapshot.val() as Record<string, Omit<Patient, "patientId">> | null) ?? {};
    callback(Object.entries(value).map(([patientId, data]) => ({ patientId, ...data })));
  });
}

export async function getPatient(patientId: string): Promise<Patient | null> {
  const db = getStaffDb();
  const snapshot = await get(ref(db, `${PATIENTS_PATH}/${patientId}`));
  return toPatient(patientId, snapshot.val() as Omit<Patient, "patientId"> | null);
}

/** Live-subscribes to a single patient record — the Patient Profile screen uses this so an edit/deactivation is reflected immediately without a manual refetch. */
export function subscribeToPatient(patientId: string, callback: (patient: Patient | null) => void): Unsubscribe {
  const db = getStaffDb();
  return onValue(ref(db, `${PATIENTS_PATH}/${patientId}`), (snapshot) => {
    callback(toPatient(patientId, snapshot.val() as Omit<Patient, "patientId"> | null));
  });
}

export async function findByPatientNumber(patientNumber: string): Promise<Patient | null> {
  const db = getStaffDb();
  const normalized = normalizePatientNumber(patientNumber);
  const indexSnapshot = await get(ref(db, `${PATIENT_NUMBERS_PATH}/${normalized}`));
  const patientId = indexSnapshot.val() as string | null;
  if (!patientId) return null;
  return getPatient(patientId);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreatePatientInput {
  firstName: string;
  patientNumber: string;
  createdByUid: string;
}

/**
 * Claims `patientNumbers/{normalized} -> patientId` and writes the patient
 * record itself in ONE atomic multi-location `update()` — this is what
 * makes "two active patients sharing a clinic number" actually impossible,
 * not just discouraged by the UI: Firebase evaluates a multi-location
 * update as a single unit, so if the `patientNumbers/{normalized}` rule's
 * `!data.exists()` (database.rules.json) rejects it, the WHOLE update is
 * rejected — the patient record is never written either.
 *
 * RELIABILITY FIX: this used to be two separate round trips — a
 * runTransaction() claim on `patientNumbers/{normalized}` immediately
 * followed by a plain update() writing `patients/{patientId}`. The claim
 * (see database.rules.json: `!data.exists()`, no updates or deletes ever —
 * permanent, deliberately, so deactivating a patient never frees their
 * number for reuse) could commit and then the SECOND write could still fail
 * (a network drop between the two calls), permanently burning a clinic
 * number with no patient record ever created — an unrecoverable orphan the
 * client has no way to roll back afterward, since the rule that makes the
 * claim permanent also blocks deleting it. A single atomic update has no
 * such window: both writes land together or neither does.
 *
 * The `get()` existence check below is only a fast, friendly path (a
 * precise "duplicate-number" error without a wasted round trip for the
 * common case) — the REAL uniqueness guarantee is the security rule
 * rejecting the atomic update itself if a genuine race is lost between that
 * check and this write; see mapCreateError's `PERMISSION_DENIED` branch.
 */
export async function createPatient(input: CreatePatientInput): Promise<Patient> {
  const firstName = input.firstName.trim();
  const nameError = validateFirstName(firstName);
  if (nameError) throw new PatientRepositoryException(nameError);

  const normalizedNumber = normalizePatientNumber(input.patientNumber);
  const numberError = validatePatientNumber(normalizedNumber);
  if (numberError) throw new PatientRepositoryException(numberError);

  const db = getStaffDb();
  const patientId = push(ref(db, PATIENTS_PATH)).key;
  if (!patientId) throw new PatientRepositoryException("unknown");

  const existing = await get(ref(db, `${PATIENT_NUMBERS_PATH}/${normalizedNumber}`));
  if (existing.exists()) throw new PatientRepositoryException("duplicate-number");

  const now = Date.now();
  const record: Omit<Patient, "patientId"> = {
    patientNumber: normalizedNumber,
    firstName,
    createdAt: now,
    updatedAt: now,
    createdByUid: input.createdByUid,
    active: true,
  };
  try {
    await update(ref(db), {
      [`${PATIENT_NUMBERS_PATH}/${normalizedNumber}`]: patientId,
      [`${PATIENTS_PATH}/${patientId}`]: record,
    });
  } catch (error) {
    throw new PatientRepositoryException(mapCreateError(error));
  }
  return { patientId, ...record };
}

/** A rejected atomic create has no other honest explanation than "lost the patientNumbers race between the fast-path check and this write" — every other input was already validated above, and the record shape always satisfies the `patients/$patientId` rule. */
function mapCreateError(error: unknown): PatientRepositoryError {
  if ((error as { code?: string } | null)?.code === "PERMISSION_DENIED") return "duplicate-number";
  return mapUnknownError(error);
}

/** firstName only — patientNumber is immutable after creation (see createPatient's doc comment and database.rules.json). */
export async function updatePatientFirstName(patientId: string, firstName: string): Promise<void> {
  const trimmed = firstName.trim();
  const nameError = validateFirstName(trimmed);
  if (nameError) throw new PatientRepositoryException(nameError);

  const db = getStaffDb();
  try {
    await update(ref(db, `${PATIENTS_PATH}/${patientId}`), { firstName: trimmed, updatedAt: Date.now() });
  } catch (error) {
    throw new PatientRepositoryException(mapUnknownError(error));
  }
}

/** Soft-deactivate only — see the task's "DO NOT hard delete" requirement. The patient record and their patientNumbers claim both persist untouched. */
export async function deactivatePatient(patientId: string): Promise<void> {
  const db = getStaffDb();
  try {
    await update(ref(db, `${PATIENTS_PATH}/${patientId}`), { active: false, updatedAt: Date.now() });
  } catch (error) {
    throw new PatientRepositoryException(mapUnknownError(error));
  }
}
