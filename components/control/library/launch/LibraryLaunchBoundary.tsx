"use client";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  GAME_REGISTRY,
  type GameId,
  type SurfaceType,
} from "@/lib/games/registry";
import {
  handModeReady,
  MODE_NAMES,
  REQUEST_MODES,
  requestedInput,
  type LaunchMode,
} from "@/lib/games/library/capabilities";
import { useDualSensorRuntime } from "@/components/control/sensors/SensorRuntimeProvider";
import { useControlWorkspace } from "@/components/control/ui/ControlWorkspace";
import styles from "./launch.module.css";
export interface LibraryLaunchAdapter {
  modes: readonly LaunchMode[];
  sessionKey?: string;
  /** Calls existing per-game commands; false means native lifecycle/ownership rejected configuration. */
  apply: (mode: LaunchMode) => boolean;
  projections?: readonly ("WALL" | "FLOOR")[];
  applyProjection?: (projection: "WALL" | "FLOOR") => boolean;
}
interface Registered {
  id: GameId;
  get: () => LibraryLaunchAdapter;
}
interface LaunchContextValue {
  register: (adapter: Registered) => () => void;
  adapter: Registered | null;
  onIntent: (id: GameId | null) => void;
  onConfirm: (key: string | null) => void;
  launchId: GameId | null;
  confirmedKey: string | null;
}
const LaunchContext = createContext<LaunchContextValue | null>(null);
/** Preference stays in the canonical route URL. Gameplay changes use the game's existing config/session publishing. */
export function LibraryLaunchBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const [adapter, setAdapter] = useState<Registered | null>(null);
  const [launchId, setLaunchId] = useState<GameId | null>(null),
    [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const register = useCallback((next: Registered) => {
    setAdapter(next);
    return () => setAdapter((current) => (current === next ? null : current));
  }, []);
  const value = useMemo(
    () => ({
      register,
      launchId,
      confirmedKey,
      adapter,
      onIntent: setLaunchId,
      onConfirm: setConfirmedKey,
    }),
    [register, launchId, confirmedKey, adapter],
  );
  return (
    <LaunchContext.Provider value={value}>{children}</LaunchContext.Provider>
  );
}
/** The canonical Control frame places launch preferences inline, away from gameplay buttons. */
export function LibraryLaunchControls() {
  const context = useContext(LaunchContext);
  return context ? (
    <Suspense fallback={null}>
      <LaunchPanel
        adapter={context.adapter}
        onIntent={context.onIntent}
        onConfirm={context.onConfirm}
      />
    </Suspense>
  ) : null;
}
/** Additive bridge to native configuration, with no new sessions, input transport or history records. */
export function useLibraryLaunchAdapter(
  id: GameId,
  adapter: LibraryLaunchAdapter,
) {
  const context = useContext(LaunchContext),
    register = context?.register,
    latest = useRef(adapter);
  useEffect(() => {
    latest.current = adapter;
  });
  useEffect(
    () => register?.({ id, get: () => latest.current }),
    [id, register],
  );
  return !!(
    adapter.projections &&
    adapter.projections.length > 1 &&
    context?.launchId === id &&
    context.confirmedKey !== `${id}:${adapter.sessionKey}`
  );
}
function LaunchPanel({
  adapter,
  onIntent,
  onConfirm,
}: {
  adapter: Registered | null;
  onIntent: (id: GameId | null) => void;
  onConfirm: (key: string) => void;
}) {
  const pathname = usePathname(),
    query = useSearchParams(),
    input = requestedInput(query.get("input"));
  const game = GAME_REGISTRY.find((g) => g.route === pathname),
    { right, left } = useDualSensorRuntime(),
    workspace = useControlWorkspace();
  const handFacts = useRef({right,left});
  useEffect(() => {handFacts.current={right,left};},[right,left]);
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState("");
  const native = adapter?.id === game?.id ? adapter?.get() : null;
  const context = useContext(LaunchContext);
  const requiredProjection = !!(
    native?.projections &&
    native.projections.length > 1 &&
    context?.confirmedKey !== `${game?.id}:${native.sessionKey}`
  );
  const showModes =
    input === "DRIVING" && !!native?.modes.some((m) => m !== "MANUAL");
  const expanded = open || requiredProjection;
  useEffect(() => {
    onIntent(game?.id ?? null);
  }, [game, onIntent]);
  // The launch category already decides the surface and, where the game supports it, the input. Applied once per session
  // through the game's own native commands (retried briefly while its lifecycle/connection settles); never a device claim.
  const autoKey = native ? `${game?.id}:${native.sessionKey}:${input}` : null;
  const autoDone = useRef<string | null>(null);
  const setupOnly = !workspace.active;
  useEffect(() => {
    if (!game || !autoKey || !setupOnly || autoDone.current === autoKey) return;
    const wanted = input === "HAND" ? "WALL" : input === "FOOT" ? "FLOOR" : null;
    let attempts = 0,
      surfaceDone = false,
      modeDone = false;
    const tryApply = () => {
      const current = adapter?.id === game.id ? adapter.get() : null;
      const {right,left}=handFacts.current;
      if (!current) return false;
      if (!surfaceDone)
        surfaceDone =
          !wanted ||
          (current.projections?.length ?? 0) < 2 ||
          !current.projections?.includes(wanted) ||
          (!!current.applyProjection?.(wanted) &&
            (onConfirm(`${game.id}:${current.sessionKey}`), true));
      if (surfaceDone && !modeDone)
        modeDone =
          input !== "HAND" ||
          !current.modes.includes("RIGHT_HAND") ||
          current.apply(handModeReady("RIGHT_HAND", {connected:right.connected,centered:right.centered,pointerAt:right.pointer?.timestampMs??null,deviceId:right.deviceId}, {connected:left.connected,centered:left.centered,pointerAt:left.pointer?.timestampMs??null,deviceId:left.deviceId},performance.now()) ? "RIGHT_HAND" : "MANUAL");
      return surfaceDone && modeDone;
    };
    const timer = setInterval(() => {
      if (tryApply() || ++attempts >= 20) {
        autoDone.current = autoKey;
        clearInterval(timer);
      }
    }, 300);
    return () => clearInterval(timer);
  }, [adapter, autoKey, game, input, onConfirm, setupOnly]);
  const modes = useMemo(
    () =>
      [
        "MANUAL",
        ...(input === "MANUAL"
          ? (native?.modes ?? [])
          : REQUEST_MODES[input]
        ).filter((m) => m !== "MANUAL"),
      ] as LaunchMode[],
    [input, native?.modes],
  );

  const apply = useCallback(
    (mode: LaunchMode) => {
      const current = adapter?.id === game?.id ? adapter?.get() : null;
      if (!current?.modes.includes(mode)) {
        setMessage(
          "طريقة المشاركة غير متاحة. استخدم التحكم اليدوي.",
        );
        return;
      }
      if (
        mode.includes("HAND") &&
        !handModeReady(
          mode,
          {
            connected: right.connected,
            centered: right.centered,
            pointerAt: right.pointer?.timestampMs ?? null,
            deviceId: right.deviceId,
          },
          {
            connected: left.connected,
            centered: left.centered,
            pointerAt: left.pointer?.timestampMs ?? null,
            deviceId: left.deviceId,
          },
          performance.now(),
        )
      ) {
        setMessage(
          "اربط اليد المحددة وعايرها، أو استخدم التحكم اليدوي.",
        );
        return;
      }
      setMessage(
        current.apply(mode)
          ? `جارٍ تطبيق «${MODE_NAMES[mode].replaceAll("المعالج", "الأخصائي")}». تأكد من جاهزية الجهاز قبل البدء.`
          : "تحقق من الاتصال، وأوقف النشاط مؤقتًا لتغيير الإعداد. لاستخدام المقود، اختر الجهاز وعايره أولًا.",
      );
    },
    [adapter, game, right, left],
  );
  if (!game) return null;
  // Everything the launch category determines is applied above; only a genuinely open choice is shown.
  if (!requiredProjection && !showModes) return null;
  const surface = (
    game.surfaceType === "BOTH" ? ["WALL", "FLOOR"] : [game.surfaceType]
  ) as Exclude<SurfaceType, "BOTH">[];
  return (
    <div
      className={styles.dock}
      dir="rtl"
      lang="ar"
      data-launch-input={input}
      data-launch-game={game.id}
    >
      {!requiredProjection && (
        <button
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls="library-launch-options"
          onClick={() => setOpen(!expanded)}
        >
          طريقة المشاركة
        </button>
      )}
      {expanded && (
        <section
          className={styles.panel}
          id="library-launch-options"
          aria-label={requiredProjection ? "سطح العرض" : "طريقة المشاركة"}
        >
          <header>
            <strong>{game.nameAr}</strong>
            {!requiredProjection && (
              <button
                aria-label="إغلاق"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            )}
          </header>
          {!requiredProjection && showModes && (
            <div className={styles.modes}>
              {modes.map((mode) => (
                <button
                  key={mode}
                  disabled={mode !== "MANUAL" && !native?.modes.includes(mode)}
                  onClick={() => apply(mode)}
                >
                  {MODE_NAMES[mode].replaceAll("المعالج", "الأخصائي")}
                  {mode !== "MANUAL" &&
                    !native?.modes.includes(mode) &&
                    " · غير متاح"}
                </button>
              ))}
            </div>
          )}
          {requiredProjection && (
            <fieldset>
              <legend>اختر سطح العرض قبل البدء</legend>
              {surface.map((p) => (
                <button
                  key={p}
                  disabled={!native?.applyProjection}
                  onClick={() => {
                    const current =
                      adapter?.id === game.id ? adapter.get() : null;
                    const accepted = current?.applyProjection?.(p);
                    if (accepted) onConfirm(`${game.id}:${current?.sessionKey}`);
                    setMessage(
                      accepted
                        ? ""
                        : "أوقف النشاط مؤقتًا وانتظر الاتصال لتغيير العرض.",
                    );
                  }}
                >
                  {p === "WALL" ? "جداري" : "أرضي"}
                </button>
              ))}
            </fieldset>
          )}
          {message && <p role="status" aria-live="polite">{message}</p>}
        </section>
      )}
    </div>
  );
}
