"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import type { SelectedPatientContext } from "./types";

/**
 * PATIENT REGISTRY FOUNDATION — the one place a therapist's "I'm starting a
 * session for THIS saved patient" choice lives while they navigate
 * Patient Profile -> Game Library -> a game's setup screen (see the task's
 * "PATIENT CONTEXT" section). A React Context, provided once at the /control
 * layout (app/control/layout.tsx) so it survives ordinary client-side
 * navigation between routes under /control/* without needing router state
 * or prop-drilling — mirrors why StaffAuthGate/useStaffAuth is wired in at
 * the same layout level.
 *
 * Backed by sessionStorage (not localStorage): it should survive a
 * same-tab refresh mid-flow, but must NOT quietly outlive the browser tab
 * and leak into an unrelated future clinic day — see the task's "should not
 * leak indefinitely into unrelated future sessions." Deliberately holds
 * only `patientId` / `patientNumber` / `firstName` (SelectedPatientContext)
 * — no clinical data ever passes through here, and this context is never
 * written into `liveSession` (see the report's "Display privacy" section).
 */

const STORAGE_KEY = "shumos.control.selectedPatient";

interface PatientSessionContextValue {
  selectedPatient: SelectedPatientContext | null;
  selectPatient: (patient: SelectedPatientContext) => void;
  clearPatient: () => void;
}

const PatientSessionContext = createContext<PatientSessionContextValue | null>(null);

function isSelectedPatientContext(value: unknown): value is SelectedPatientContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.patientId === "string" && typeof candidate.patientNumber === "string" && typeof candidate.firstName === "string";
}

// Module-scoped so useSyncExternalStore's snapshot stays REFERENCE-stable
// across renders that don't touch sessionStorage (it requires that, or it
// re-renders forever) — keyed on the raw string so it only ever
// re-parses when sessionStorage's actual content changes.
let cachedRaw: string | null | undefined;
let cachedValue: SelectedPatientContext | null = null;

/**
 * The useSyncExternalStore snapshot function — sessionStorage is only ever
 * available client-side, so this is what lets the very first CLIENT read
 * differ safely from the server render (`getServerSnapshot` below returns
 * null) without React treating it as an effect-driven setState (see the
 * "set-state-in-effect" lint rule this replaces a plain useEffect+setState
 * version of this file to satisfy).
 */
function getSnapshot(): SelectedPatientContext | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cachedValue = isSelectedPatientContext(parsed) ? parsed : null;
  } catch {
    cachedValue = null;
  }
  return cachedValue;
}

function getServerSnapshot(): SelectedPatientContext | null {
  return null;
}

/** sessionStorage never changes from outside this tab's own React state updates, so there is nothing to subscribe to — this context manages its own re-renders via `override` state below, not via store notifications. */
function subscribeToNothing(): () => void {
  return () => {};
}

export function PatientSessionProvider({ children }: { children: React.ReactNode }) {
  const hydratedPatient = useSyncExternalStore(subscribeToNothing, getSnapshot, getServerSnapshot);
  // Once the therapist makes an explicit choice this tab, it always wins
  // over whatever sessionStorage happened to hold at mount time — `null`
  // is a valid, deliberate override (see clearPatient), so this can't just
  // be `SelectedPatientContext | null`.
  const [override, setOverride] = useState<{ value: SelectedPatientContext | null } | null>(null);
  const selectedPatient = override ? override.value : hydratedPatient;

  const selectPatient = useCallback((patient: SelectedPatientContext) => {
    setOverride({ value: patient });
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(patient));
    } catch {
      // Best-effort persistence only — an unavailable/full sessionStorage still leaves the in-memory context working for this tab's lifetime.
    }
  }, []);

  const clearPatient = useCallback(() => {
    setOverride({ value: null });
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // See selectPatient's catch above.
    }
  }, []);

  return <PatientSessionContext.Provider value={{ selectedPatient, selectPatient, clearPatient }}>{children}</PatientSessionContext.Provider>;
}

export function usePatientContext(): PatientSessionContextValue {
  const ctx = useContext(PatientSessionContext);
  if (!ctx) throw new Error("usePatientContext must be used within PatientSessionProvider");
  return ctx;
}
