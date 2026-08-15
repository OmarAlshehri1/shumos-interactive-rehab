"use client";

import { useEffect, useRef } from "react";
import type { Difficulty, StageNumber } from "@/lib/game";
import { usePatientContext } from "./PatientSessionContext";

/**
 * PATIENT REGISTRY TASK — "selecting Balloon Quest should prefill
 * childFirstName from the selected patient... the therapist should NOT
 * retype the child's name." Applied once per (setup screen mount, selected
 * patient) — never overwrites a name the therapist has already typed, so
 * this only ever fills a genuinely empty field. Deliberately setup-screen-
 * only (`phase === "SETUP"`): once a session exists, the name belongs to
 * that session, not to whatever patient context happens to be active.
 *
 * SESSION HISTORY TASK — also applies `selectedPatient.resumeSuggestion`
 * (set only when the therapist pressed "متابعة من آخر تقدم" on the Patient
 * Profile — see lib/sessions/resumeSuggestion.ts), prefilling difficulty
 * and starting stage the SAME single-shot way as the name. Unlike the name
 * field, there's no reliable "already touched by the therapist" signal for
 * a picker whose default is itself a valid value (EASY/stage 1) — this
 * fires once per (mount, selected patient), which in practice is before
 * the therapist has had any chance to touch the setup screen.
 *
 * Shared by both controller adapters (see ControlScreen.tsx) — patient
 * context is a /control-wide concern, not specific to the realtime vs.
 * local adapter split.
 */
export function usePatientPrefill(
  phase: string,
  childFirstName: string,
  setChildName: (value: string) => void,
  setDifficulty: (value: Difficulty) => void,
  setStartingStage: (value: StageNumber) => void,
) {
  const { selectedPatient } = usePatientContext();
  const appliedForPatientIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (phase !== "SETUP" || !selectedPatient) return;
    if (appliedForPatientIdRef.current === selectedPatient.patientId) return;
    appliedForPatientIdRef.current = selectedPatient.patientId;

    if (childFirstName.trim().length === 0) {
      setChildName(selectedPatient.firstName); // never clobber a name the therapist already typed
    }

    if (selectedPatient.resumeSuggestion) {
      setDifficulty(selectedPatient.resumeSuggestion.difficulty);
      setStartingStage(selectedPatient.resumeSuggestion.startingStage);
    }
  }, [phase, selectedPatient, childFirstName, setChildName, setDifficulty, setStartingStage]);
}
