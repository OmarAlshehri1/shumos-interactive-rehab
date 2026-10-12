"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import {
  claimControllerLease, refreshControllerLease, registerControllerPresence, subscribeToConnectionStatus, subscribeToControllerLease, subscribeToDisplayPresence,
} from "@/lib/realtime/sessionRepository";
import type { ConnectionStatus, ControllerLeaseRecord, PresenceRecord } from "@/lib/realtime/types";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";

export interface LiveFacts {
  /** A Display is connected, the connection is up and this Control owns the lease. */
  ready: boolean;
  patientId: string | null;
  uid: string | null;
  therapistName: string | null;
  /** The selected patient's (or walk-in) first name, at most 30 characters. */
  childName: string;
}

/**
 * The platform plumbing every cross-device Control needs, identical for all games and taken from the original
 * six: staff authorization, the single-controller lease (claim, refresh, takeover), connection state, Control
 * presence and Display presence. Game code adds only its own session on top.
 */
export function useLiveGameController() {
  const auth = useStaffAuth();
  const db = getStaffDb();
  const patient = usePatientContext();
  const uid = auth.uid;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [displayPresence, setDisplayPresence] = useState<PresenceRecord | null>(null);
  const [lease, setLease] = useState<ControllerLeaseRecord | null>(null);
  const [leaseKnown, setLeaseKnown] = useState(false);
  const [takeoverBlocked, setTakeoverBlocked] = useState(false);

  useEffect(() => {
    if (auth.phase !== "authorized") return;
    const connection = subscribeToConnectionStatus(db, setConnectionStatus);
    const display = subscribeToDisplayPresence(db, setDisplayPresence);
    const leaseSub = subscribeToControllerLease(db, (next) => {
      setLease(next);
      setLeaseKnown(true);
    });
    const presence = registerControllerPresence(db);
    return () => {
      connection();
      display();
      leaseSub();
      presence();
    };
  }, [auth.phase, db]);

  const isOwner = uid !== null && leaseKnown && (lease === null || lease.ownerId === uid);
  const displayConnected = displayPresence?.connected === true;
  useEffect(() => {
    if (!leaseKnown || !uid || lease?.ownerId === uid) return;
    if (!lease || (typeof lease.updatedAt === "number" && Date.now() - lease.updatedAt > 45000)) void claimControllerLease(db, uid).catch(() => {});
  }, [db, lease, leaseKnown, uid]);
  useEffect(() => {
    if (!uid || lease?.ownerId !== uid) return;
    const timer = setInterval(() => void refreshControllerLease(db).catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [db, lease, uid]);

  /** Live facts read by runtimes and publishers without re-creating them. */
  const liveRef = useRef<LiveFacts>({ ready: false, patientId: null, uid: null, therapistName: null, childName: "" });
  useEffect(() => {
    liveRef.current = {
      ready: isOwner && connectionStatus === "connected" && displayConnected,
      patientId: patient.selectedPatient?.patientId ?? null,
      uid,
      therapistName: auth.displayName,
      childName: (patient.selectedPatient?.firstName ?? patient.walkInName ?? "").trim().slice(0, 30),
    };
  }, [isOwner, connectionStatus, displayConnected, patient.selectedPatient, patient.walkInName, uid, auth.displayName]);
  /** Stable accessor for the latest platform facts; safe to call from callbacks, publishers and runtimes. */
  const getLive = useCallback((): LiveFacts => liveRef.current, []);

  const claimOwnership = useCallback(() => {
    if (uid) void claimControllerLease(db, uid).then(() => setTakeoverBlocked(false)).catch(() => setTakeoverBlocked(true));
  }, [db, uid]);

  return { auth, db, uid, patient, connectionStatus, displayConnected, isOwner, claimOwnership, takeoverBlocked, getLive };
}
