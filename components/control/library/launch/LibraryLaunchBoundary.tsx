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
    { right, left } = useDualSensorRuntime();
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState("");
  const native = adapter?.id === game?.id ? adapter?.get() : null;
  const context = useContext(LaunchContext);
  const requiredProjection = !!(
    native?.projections &&
    native.projections.length > 1 &&
    context?.confirmedKey !== `${game?.id}:${native.sessionKey}`
  );
  const expanded = open || requiredProjection;
  useEffect(() => {
    onIntent(game?.id ?? null);
  }, [game, onIntent]);
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
      <button
        className={styles.toggle}
        aria-expanded={expanded}
        aria-controls="library-launch-options"
        onClick={() => setOpen(!expanded)}
      >
        {requiredProjection
          ? "اختر سطح العرض وطريقة المشاركة"
          : "طريقة المشاركة المطلوبة"}
      </button>
      {expanded && (
        <section
          className={styles.panel}
          id="library-launch-options"
          aria-label="إعدادات إطلاق النشاط"
        >
          <header>
            <strong>{game.nameAr}</strong>
            <button
              aria-label="إغلاق إعدادات المشاركة"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
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
          {input === "FOOT" && (
            <p>
              المحاكاة وتلميحات حركة القدم لا تثبت الاتصال الفعلي أو موقع الطفل.
            </p>
          )}
          {input === "JOYSTICK" && (
            <p>
              محوّل عصي التحكم الفعلي وخيارات الأزرار لم تُنفّذ بعد. لا يلزم ضغط
              زر في التحكم اليدوي.
            </p>
          )}
          {input === "DRIVING" && (
            <p>
              قراءة المقود محلية واختيار الجهاز والمحاور والمعايرة يتم داخل
              النشاط. نقل الإدخال من جهاز آخر والتحقق المادي معلّقان.
            </p>
          )}
          <fieldset>
            <legend>سطح العرض المنفّذ</legend>
            {surface.map((p) => (
              <button
                key={p}
                disabled={surface.length === 1 || !native?.applyProjection}
                onClick={() => {
                  const current =
                    adapter?.id === game.id ? adapter.get() : null;
                  const accepted = current?.applyProjection?.(p);
                  if (accepted) onConfirm(`${game.id}:${current?.sessionKey}`);
                  setMessage(
                    accepted
                      ? "جارٍ تطبيق سطح العرض. راجع مساحة الحركة قبل البدء."
                      : "أوقف النشاط مؤقتًا وانتظر الاتصال لتغيير العرض.",
                  );
                }}
              >
                {p === "WALL" ? "جداري" : "أرضي"}
              </button>
            ))}
          </fieldset>
          {surface.length === 2 && <p>اختر سطح العرض قبل البدء.</p>}
          {message && <p role="status" aria-live="polite">{message}</p>}
        </section>
      )}
    </div>
  );
}
