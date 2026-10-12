"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  ContinuousMotionController,
  LocalStorageRoleAssignmentStore,
  WITMOTION_OUTPUT_RATE_CODES,
  arabicLabelFor as arabicRoleLabel,
  assignRole,
  type MotionFilterMode,
  type MotionSample,
  type NormalizedPointer,
  PhysicalInputManager,
  type PhysicalRole,
  type SemanticDetector,
  type SensorHandRuntimeConfig,
  Wt901BleInputSource,
  createUncalibratedProfile,
} from "@/lib/physicalInput";

/** One shared persisted device->role map for both role instances — see roleAssignment.ts. Cheap to construct (always reads live from localStorage, no internal cache), so each hook instance owning its own reference is equivalent to a singleton. */
function roleAssignmentStore(): LocalStorageRoleAssignmentStore {
  return new LocalStorageRoleAssignmentStore();
}

const PASSIVE_DETECTOR: SemanticDetector = { reset: () => {}, observe: () => null };
const RUNTIME_RATE_HZ = 50;
const RUNTIME_RATE_CODE = WITMOTION_OUTPUT_RATE_CODES[RUNTIME_RATE_HZ];
/** Backoff schedule for an unexpected mid-session drop — ~15s total before giving up and requiring a manual tap; the sensor being briefly out of range or a low-battery blip is far more likely than a real teardown. */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000];

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "WEB_BLUETOOTH_UNAVAILABLE") return "هذا المتصفح لا يدعم Web Bluetooth. استخدم Chrome أو Edge على جهاز Mac.";
  if (error instanceof Error && error.message === "WT901BLECL_DEVICE_ALREADY_IN_USE") return "هذا الحساس مرتبط بالفعل بيدٍ أخرى. اختر الحساس الفعلي الآخر.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "لم يتم اختيار حساس.";
  return "تعذّر الاتصال. أغلق تطبيق WITMOTION، تأكد من تشغيل الحساس، ثم حاول مرة أخرى.";
}

export interface SensorRuntime {
  readonly role: PhysicalRole;
  readonly connection: ConnectionState;
  readonly connected: boolean;
  readonly connecting: boolean;
  /** True while automatically retrying an unexpected mid-session drop (never true for the very first connect, which only ever shows `connecting`) — distinct from `connecting` so the UI can say "جاري إعادة الاتصال..." instead of the first-time "جاري الاتصال...". */
  readonly reconnecting: boolean;
  readonly sample: MotionSample | null;
  readonly pointer: NormalizedPointer | null;
  readonly centered: boolean;
  readonly liveRateHz: number | null;
  readonly error: string | null;
  readonly rateNote: string | null;
  readonly filterMode: MotionFilterMode;
  /** The currently-connected physical device id, or null while disconnected — used by the sibling role's runtime to avoid ever silently claiming the same physical WT901BLECL (see SensorRuntimeProvider's dual-hand wiring). */
  readonly deviceId: string | null;
  /**
   * Increments once per successful recenter() call. Every mounted
   * useSensorPointerTargets/useContactTargets watches this to prime its
   * SensorContactRouter's "already inside" state at the new recentered
   * position instead of firing a phantom contact for the pointer's jump —
   * see SensorContactRouter.notePendingRecenter and
   * ContactActivationGate.primeAt.
   */
  readonly recenterEpoch: number;
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly recenter: () => void;
  readonly selectFilter: (mode: MotionFilterMode) => void;
}

/**
 * ONE role's WT901BLECL connection — the reusable engine both RIGHT_HAND and
 * LEFT_HAND instantiate independently (see SensorRuntimeProvider.tsx),
 * extracted unchanged in BEHAVIOR from what used to be RIGHT_HAND's own
 * inline effect so the accepted, real-gameplay-validated RIGHT_HAND path is
 * byte-for-byte preserved (see SensorHandRuntimeConfig.ts's frozen
 * RIGHT_HAND_RUNTIME_CONFIG and its regression test) while LEFT_HAND reuses
 * the exact same mechanism with its own independent config/state — never a
 * second, duplicated implementation (tonight's dual-sensor brief, section 6).
 *
 * `getExcludedDeviceIds` is read fresh (via a ref, not a stale closure) at
 * the moment of each connect/reconnect attempt, so this role's source never
 * silently claims a physical device another role's source currently owns —
 * see Wt901BleInputSource's own `excludeDeviceIds` doc comment for the
 * BLE-layer half of "never assign one sensor to two roles"; roleAssignment.ts's
 * assignRole() refusal is the persisted-role half.
 */
export function useSensorHandRuntime(config: SensorHandRuntimeConfig, getExcludedDeviceIds: () => readonly string[]): SensorRuntime {
  const sourceRef = useRef<Wt901BleInputSource | null>(null);
  const managerRef = useRef<PhysicalInputManager | null>(null);
  const controllerRef = useRef<ContinuousMotionController | null>(null);
  const originalRateCodeRef = useRef<number | null>(null);
  const sampleTimesRef = useRef<number[]>([]);
  /** Set right before an explicit disconnect() call, read by the connection-state effect to tell "the therapist chose to disconnect" apart from "the sensor unexpectedly dropped" — only the latter triggers automatic reconnect. */
  const manualDisconnectRef = useRef(false);
  const getExcludedDeviceIdsRef = useRef(getExcludedDeviceIds);
  useEffect(() => {
    getExcludedDeviceIdsRef.current = getExcludedDeviceIds;
  }, [getExcludedDeviceIds]);

  const [connection, setConnection] = useState(ConnectionState.DISCONNECTED);
  const [reconnecting, setReconnecting] = useState(false);
  const [sample, setSample] = useState<MotionSample | null>(null);
  const [pointer, setPointer] = useState<NormalizedPointer | null>(null);
  const [centered, setCentered] = useState(false);
  const [filterMode, setFilterMode] = useState<MotionFilterMode>("ADAPTIVE_EMA");
  const [error, setError] = useState<string | null>(null);
  const [rateNote, setRateNote] = useState<string | null>(null);
  const [liveRateHz, setLiveRateHz] = useState<number | null>(null);
  const [recenterEpoch, setRecenterEpoch] = useState(0);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  /** Best-effort RAM-only rate bump for gameplay; never blocks play if it fails. */
  const applyRuntimeRate = useCallback(async (): Promise<void> => {
    const source = sourceRef.current;
    if (!source || RUNTIME_RATE_CODE === undefined) return;
    try {
      const currentCode = await source.readOutputRateCode();
      originalRateCodeRef.current = currentCode;
      if (currentCode === RUNTIME_RATE_CODE) {
        setRateNote(`المعدل الحالي ${RUNTIME_RATE_HZ} Hz بالفعل — لا حاجة لتغييره.`);
        return;
      }
      await source.setTemporaryOutputRate(RUNTIME_RATE_HZ);
      setRateNote(`تم ضبط معدل التشغيل مؤقتًا إلى ${RUNTIME_RATE_HZ} Hz (سيُستعاد الإعداد الأصلي عند الفصل).`);
    } catch {
      setRateNote("تعذّر ضبط معدل التشغيل — الاستمرار بالمعدل الحالي دون توقف اللعبة.");
    }
  }, []);

  useEffect(() => {
    const source = new Wt901BleInputSource(config.deviceHintKey);
    const manager = new PhysicalInputManager();
    const controller = new ContinuousMotionController(config.motionConfig);
    sourceRef.current = source;
    managerRef.current = manager;
    controllerRef.current = controller;
    manager.assignRole(config.role, source, PASSIVE_DETECTOR, createUncalibratedProfile(config.role));
    manager.attachContinuousController(config.role, controller);

    // AUTOMATIC RECONNECT (unexpected mid-session drop only — never after an explicit disconnect() call,
    // and never a second attempt while one is already scheduled/in flight).
    manualDisconnectRef.current = false;
    let wasConnected = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function clearReconnectTimer(): void {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnectAttempt(): void {
      if (cancelled || reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
        setReconnecting(false);
        return;
      }
      setReconnecting(true);
      const delayMs = RECONNECT_DELAYS_MS[reconnectAttempt];
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void source.tryReconnectAuthorizedDevice({ excludeDeviceIds: getExcludedDeviceIdsRef.current() }).then((reconnected) => {
          if (cancelled) return;
          if (reconnected) {
            reconnectAttempt = 0;
            setReconnecting(false);
            void applyRuntimeRate();
          } else {
            scheduleReconnectAttempt();
          }
        });
      }, delayMs);
    }

    const unsubscribeConnection = source.onConnectionStateChange((state) => {
      if (state === ConnectionState.CONNECTED) {
        // PERSISTED ROLE GUARD (tonight's dual-sensor brief, section 5/10-M):
        // checked against the SAME localStorage-backed device->role map a
        // role-assignment UI would use, not just the other role's currently
        // live deviceId — this also catches the case where the OTHER role
        // is offline right now but was previously bound to this exact
        // physical sensor. assignRole() is a no-op confirm when this device
        // already legitimately belongs to config.role (the ordinary case on
        // every normal reconnect); it only refuses when the device belongs
        // to a genuinely DIFFERENT role.
        const conflict = assignRole(roleAssignmentStore(), source.deviceId, config.role);
        if (conflict) {
          setError(
            `هذا الحساس مُعيَّن بالفعل لـ «${conflict.existingRoleOfDevice ? arabicRoleLabel(conflict.existingRoleOfDevice) : "دور آخر"}». استخدم إجراء «استبدال» صراحةً لتغيير تعيينه أولًا.`,
          );
          void source.disconnect();
          return; // never adopted as this role's connection - the DISCONNECTED transition below will follow
        }
        setConnection(state);
        wasConnected = true;
        manualDisconnectRef.current = false;
        reconnectAttempt = 0;
        clearReconnectTimer();
        setReconnecting(false);
        setDeviceId(source.deviceId);
        return;
      }
      setConnection(state);
      if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
        setSample(null);
        setPointer(null);
        setCentered(false);
        setDeviceId(null);
        sampleTimesRef.current = [];
        setLiveRateHz(null);
        const shouldAutoReconnect = wasConnected && !manualDisconnectRef.current;
        wasConnected = false;
        if (shouldAutoReconnect) {
          scheduleReconnectAttempt();
        } else {
          setReconnecting(false);
        }
      }
    });
    const unsubscribeSample = manager.onSampleObserved((role, nextSample) => {
      if (role !== config.role) return;
      setSample(nextSample);
      const arrival = performance.now();
      const recent = [...sampleTimesRef.current, arrival].filter((time) => time >= arrival - 2000);
      sampleTimesRef.current = recent;
      const seconds = recent.length > 1 ? (recent.at(-1)! - recent[0]) / 1000 : 0;
      setLiveRateHz(seconds > 0 ? (recent.length - 1) / seconds : null);
    });
    const unsubscribePointer = manager.onPointerChanged((role, nextPointer) => {
      if (role !== config.role) return;
      setPointer(nextPointer);
      setCentered(!!nextPointer);
    });

    // AUTOMATIC CONNECTION: on every mount, silently try a previously-authorized device via Web
    // Bluetooth's persistent-permission getDevices() — no chooser, no user gesture. A false/failed
    // result here is an ordinary outcome (sensor off, never authorized yet, browser doesn't support
    // getDevices(), or the only authorized match is already claimed by the other role), not an error
    // to surface — the therapist just sees the manual button.
    void source.tryReconnectAuthorizedDevice({ excludeDeviceIds: getExcludedDeviceIdsRef.current() }).then((reconnected) => {
      if (!cancelled && reconnected) void applyRuntimeRate();
    });

    return () => {
      cancelled = true;
      clearReconnectTimer();
      unsubscribeConnection();
      unsubscribeSample();
      unsubscribePointer();
      void manager.unassignRole(config.role);
      sourceRef.current = null;
      managerRef.current = null;
      controllerRef.current = null;
    };
    // config.role/config.deviceHintKey/config.motionConfig are constant for a given hook instance
    // (RIGHT_HAND vs LEFT_HAND are two separate call sites, never a role that changes mid-mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyRuntimeRate]);

  const connect = useCallback(async (): Promise<void> => {
    setError(null);
    setRateNote(null);
    try {
      await sourceRef.current?.connect({ excludeDeviceIds: getExcludedDeviceIdsRef.current() });
      await applyRuntimeRate();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [applyRuntimeRate]);

  const disconnect = useCallback(async (): Promise<void> => {
    setError(null);
    setReconnecting(false);
    manualDisconnectRef.current = true;
    const source = sourceRef.current;
    const originalCode = originalRateCodeRef.current;
    if (source && originalCode !== null && source.connectionState === ConnectionState.CONNECTED) {
      try {
        await source.restoreOutputRateCode(originalCode);
      } catch {
        // Best-effort only — proceed with disconnect regardless.
      }
    }
    originalRateCodeRef.current = null;
    await source?.disconnect();
  }, []);

  /** Therapist fallback only — normal play centers automatically on connect, no button press required. */
  const recenter = useCallback((): void => {
    const didCenter = controllerRef.current?.recenter() ?? false;
    if (!didCenter) {
      setError("انتظر وصول قراءة من الحساس أولاً.");
      return;
    }
    setError(null);
    setPointer(controllerRef.current?.currentPointer ?? null);
    // Tells every mounted contact router (see useSensorPointerTargets.ts) to
    // prime at the new centered position instead of firing a phantom
    // contact for the jump — see SensorContactRouter.notePendingRecenter.
    setRecenterEpoch((epoch) => epoch + 1);
  }, []);

  const selectFilter = useCallback((mode: MotionFilterMode): void => {
    setFilterMode(mode);
    controllerRef.current?.updateConfig({ filterMode: mode });
  }, []);

  return useMemo<SensorRuntime>(
    () => ({
      role: config.role,
      connection,
      connected: connection === ConnectionState.CONNECTED,
      connecting: connection === ConnectionState.CONNECTING,
      reconnecting,
      sample,
      pointer,
      centered,
      liveRateHz,
      error,
      rateNote,
      filterMode,
      deviceId,
      recenterEpoch,
      connect,
      disconnect,
      recenter,
      selectFilter,
    }),
    [config.role, connection, reconnecting, sample, pointer, centered, liveRateHz, error, rateNote, filterMode, deviceId, recenterEpoch, connect, disconnect, recenter, selectFilter],
  );
}
