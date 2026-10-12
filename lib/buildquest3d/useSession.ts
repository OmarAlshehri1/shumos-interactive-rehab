"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LOCAL_POINTER_CHANNEL_NAME } from "@/lib/display/LocalPointerChannel";
import {
  action,
  configure,
  createState,
  guard,
  input,
  type Action,
  type Config,
  type State,
} from "./gameplay";
import {
  CHANNEL_PREFIX,
  recover,
  replicaAccept,
  roomValid,
  validInput,
} from "./protocol";
import { BuildQuestSensor } from "./sensorInput";
import type { Pointer } from "./stages";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useFirebaseBuildQuestSession } from "./useFirebaseSession";
import { applyManual, manualCommand, type ManualCommand } from "./manual";

export function useLocalBuildQuestSession(authority: boolean, patientId: string | null = null, explicitSession?: string) {
  void patientId;
  const [state, setState] = useState<State | null>(null),
    [connected, setConnected] = useState(false),
    [sensorStatus, setSensorStatus] = useState("waiting");
  const dispatch = useRef<
    (a: Action | { config: Partial<Config>; stage?: number } | ManualCommand) => void
  >(() => {});
  const pointer = useRef<(p: Pointer, activate: boolean) => void>(() => {});
  useEffect(() => {
    const room = explicitSession ?? new URLSearchParams(location.search).get("session");
    if (!roomValid(room)) return;
    const session = room,
      storage = `${CHANNEL_PREFIX}${session}:snapshot`,
      channel = new BroadcastChannel(CHANNEL_PREFIX + session),
      client = crypto.randomUUID();
    const sensor = new BuildQuestSensor(),
      sensorChannel = authority
        ? new BroadcastChannel(LOCAL_POINTER_CHANNEL_NAME)
        : null;
    if (sensorChannel) sensorChannel.onmessage = (e) => sensor.accept(e.data);
    let live: State | null = null,
      owned = false,
      disposed = false,
      lastSeen = 0,
      lastInput = 0,
      acceptAfter = 0,
      lastPublish = 0,
      manualUntil = 0,
      seq = 0,
      activate = false;
    let currentPointer: Pointer | null = null,
      pointerActive = false,
      dirty = false;
    const seen = new Map<string, number>();
    const abort = new AbortController();
    let release: () => void = () => {};
    const persist = () => {
      if (!live) return;
      try {
        localStorage.setItem(storage, JSON.stringify(live));
      } catch {
        /* State remains live; no cloud fallback. */
      }
    };
    const emit = () => {
      if (!live) return;
      setState(live);
      channel.postMessage({ type: "state", state: live, sentAt: Date.now() });
    };
    const change = (next: State) => {
      const before = live;
      live = next;
      if (next !== before) {
        dirty = true;
        setState(next);
        if (
          !before ||
          before.run !== next.run ||
          before.status !== next.status ||
          before.events.length !== next.events.length
        ) {
          persist();
          emit();
        }
      }
    };
    dispatch.current = (a) => {
      if (!owned || !live) return;
      const previous = live;
      change(
        typeof a === "object" && "kind" in a ? applyManual(live, a) : typeof a === "string"
          ? action(live, a)
          : configure(live, a.config, a.stage),
      );
      if (live !== previous) {
        currentPointer = null;
        pointerActive = false;
        activate = false;
        acceptAfter = Date.now();
        sensor.rearm(live.pointer);
        if (typeof a === "object" && "kind" in a) {
          manualUntil = Date.now() + 1800; currentPointer = live.pointer; pointerActive = true; lastInput = Date.now();
        }
        persist();
        emit();
      }
    };
    pointer.current = (p, click) => {
      if (!live || (!authority && live.config.input === "sensor")) return;
      if (authority && owned) {
        manualUntil = Date.now() + 1800;
        currentPointer = p;
        pointerActive = true;
        lastInput = Date.now();
        activate ||= click;
      } else if (!authority) {
        channel.postMessage({
          type: "input",
          guard: guard(live),
          client,
          seq: ++seq,
          sentAt: Date.now(),
          ...p,
          activate: click,
        });
      }
    };
    channel.onmessage = (e) => {
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (authority && owned && live) {
        if (m.type === "hello") {
          emit();
          return;
        }
        if (
          live.config.input !== "sensor" &&
          m.sentAt >= acceptAfter &&
          validInput(live, m, Date.now(), seen)
        ) {
          currentPointer = { x: m.x, y: m.y };
          pointerActive = true;
          lastInput = Date.now();
          activate ||= m.activate;
        }
      } else if (
        !authority &&
        m.type === "state" &&
        typeof m.sentAt === "number" &&
        Date.now() - m.sentAt >= 0 &&
        Date.now() - m.sentAt <= 1000 &&
        replicaAccept(live, m.state, session)
      ) {
        live = m.state;
        lastSeen = Date.now();
        setConnected(true);
        setState(live);
      }
    };
    if (authority) {
      if (navigator.locks)
        void navigator.locks
          .request(
            `${CHANNEL_PREFIX}${session}:authority`,
            { mode: "exclusive", signal: abort.signal },
            async (lock) => {
              if (!lock || disposed) return;
              owned = true;
              setConnected(true);
              try {
                live = recover(
                  JSON.parse(localStorage.getItem(storage) ?? "null"),
                  session,
                );
              } catch {
                live = null;
              }
              live ??= createState(session);
              sensor.rearm(live.pointer);
              persist();
              emit();
              await new Promise<void>((resolve) => {
                release = resolve;
              });
              owned = false;
            },
          )
          .catch(() => {});
    } else channel.postMessage({ type: "hello" });
    let lastTick = performance.now();
    const timer = setInterval(() => {
      const wall = Date.now(),
        now = performance.now(),
        dt = Math.min(100, now - lastTick);
      lastTick = now;
      if (authority && owned && live) {
        const sensorPointer = sensor.sample();
        setSensorStatus(sensor.status);
        if (live.status === "running") {
          const p =
            live.config.input === "sensor" && wall > manualUntil
              ? sensorPointer
              : pointerActive
                ? currentPointer
                : null;
          // A held mouse pointer remains intentional while the display sends its heartbeat.
          const fresh =
            live.config.input === "sensor" || wall - lastInput < 250;
          change(input(live, fresh ? p : null, dt, activate));
          activate = false;
        }
        if (wall - lastPublish >= 100) {
          lastPublish = wall;
          emit();
        }
        if (dirty && wall % 1000 < 40) {
          persist();
          dirty = false;
        }
      } else if (!authority) {
        setConnected(wall - lastSeen < 1000);
        if (wall - lastPublish > 350) {
          lastPublish = wall;
          channel.postMessage({ type: "hello" });
        }
      }
    }, 33);
    const unload = () => {
      if (owned && live) {
        live = {
          ...live,
          status: live.status === "running" ? "paused" : live.status,
          inputReady: false,
        };
        persist();
      }
    };
    window.addEventListener("pagehide", unload);
    return () => {
      disposed = true;
      unload();
      abort.abort();
      release();
      clearInterval(timer);
      window.removeEventListener("pagehide", unload);
      channel.close();
      sensorChannel?.close();
      dispatch.current = () => {};
      pointer.current = () => {};
    };
  }, [authority, explicitSession]);
  const act = useCallback((a: Action) => dispatch.current(a), []);
  const updateConfig = useCallback(
    (config: Partial<Config>, stage?: number) =>
      dispatch.current({ config, stage }),
    [],
  );
  const sendPointer = useCallback(
    (p: Pointer, activate = false) => pointer.current(p, activate),
    [],
  );
  const selectPiece = useCallback((id: string) => { if (state) dispatch.current(manualCommand(state, "select", id)); }, [state]);
  const placePiece = useCallback((id: string) => { if (state) dispatch.current(manualCommand(state, "place", id)); }, [state]);
  return {
    state,
    connected,
    sensorStatus,
    act,
    configure: updateConfig,
    sendPointer,
    selectPiece, placePiece, pending: false, error: null as string | null, historyStatus: "local-only", cloud: false,
    recovered: false, recoveryBlocked: false, takeoverAllowed: true, superseded: false, takeOver: () => {}, displayConnected: true,
  };
}
/** Static environment selection matches the platform; a configured offline backend never falls back to local. */
export const useBuildQuestSession = isRealtimeEnabled() ? useFirebaseBuildQuestSession : useLocalBuildQuestSession;
