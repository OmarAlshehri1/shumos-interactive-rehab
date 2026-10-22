"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { GameDefinition } from "@/lib/games/registry";
import { useGameSafety } from "@/components/control/visits/GameSafetyProvider";
import { workspacePresentation } from "@/lib/control/workspacePresentation";
import { realGameThumbnail } from "@/components/control/library/realGameThumbnails";
import { TherapistStatus } from "./TherapistSurface";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { useVisit } from "@/components/control/visits/VisitProvider";
import ui from "./therapist.module.css";
import styles from "./workspace.module.css";

type Slot = "preview" | "assistance" | "session" | "settings" | "dialogs" | "navigation" | "progress";
type Targets = Record<Slot, HTMLElement | null>;
interface Workspace { available: boolean; active: boolean; targets: Targets; setupTarget: HTMLElement | null; registerSetup: ((node: HTMLElement | null) => void) | null }
const empty: Targets = { preview: null, assistance: null, session: null, settings: null, dialogs: null, navigation: null, progress: null };
const Context = createContext<Workspace>({ available: false, active: false, targets: empty, setupTarget: null, registerSetup: null });
export const useControlWorkspace = () => useContext(Context);

/** Keep the original Display composition at 16:9 instead of crowding its HUD into a short laptop viewport. */
function ScaledPreview({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = () => { const rect = element.getBoundingClientRect(); setScale(Math.min(rect.width / 1280, rect.height / 720)); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => observer.disconnect();
  }, []);
  return <div className={styles.scaledPreview} ref={host}><div className={styles.previewFrame} style={{ "--preview-scale": scale } as CSSProperties}>{children}</div></div>;
}

/** Relocates the original React element, including its handler and guards; never clones an action or mounts a controller. */
export function ControlSlot({ slot, children, disabled, when = true }: { slot: Slot; children: ReactNode; disabled?: boolean; when?: boolean }) {
  const workspace = useControlWorkspace();
  if (!when || (!workspace.active && (slot !== "settings" || !workspace.setupTarget))) return <>{children}</>;
  const target = workspace.active ? workspace.targets[slot] : workspace.setupTarget;
  return target ? createPortal(<fieldset disabled={disabled} data-native-slot={slot}>{slot === "preview" ? <ScaledPreview>{children}</ScaledPreview> : children}</fieldset>, target) : null;
}

export function ControlWorkspace({ game, children }: { game: GameDefinition; children: ReactNode }) {
  const safety = useGameSafety();
  const { selectedPatient } = usePatientContext();
  const { visit } = useVisit();
  const info = workspacePresentation(safety.live, game.id);
  const [preview, setPreview] = useState<HTMLElement | null>(null);
  const [assistance, setAssistance] = useState<HTMLElement | null>(null);
  const [session, setSession] = useState<HTMLElement | null>(null);
  const [settings, setSettings] = useState<HTMLElement | null>(null);
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);
  const [progress, setProgress] = useState<HTMLElement | null>(null);
  const [dialogs, setDialogs] = useState<HTMLElement | null>(null);
  const [setupTarget, registerSetup] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ available: true, active: info.active, targets: { preview, assistance, session, settings, dialogs, navigation, progress }, setupTarget, registerSetup }), [info.active, preview, assistance, session, settings, dialogs, navigation, progress, setupTarget]);
  const artwork = realGameThumbnail(game.id);
  return <Context.Provider value={value}>
    <div className={`${ui.theme} ${styles.workspace}`} data-workspace-active={info.active}>
      <div ref={setDialogs} className={styles.dialogs} />
      <div hidden={!info.active} className={styles.liveSurface}>
        <header className={styles.liveHeader}><div><h1>{game.nameAr}</h1><p>{info.level && `المستوى: ${info.level}`}{info.stage && ` · المرحلة ${info.stage}`}{selectedPatient && safety.live?.patientId === selectedPatient.patientId && ` · ${selectedPatient.firstName}`}{visit && !visit.endedAt && " · زيارة علاجية"}</p></div><div className={styles.headerStatus}>{info.elapsed && <span aria-label="وقت اللعب">{info.elapsed}</span>}<TherapistStatus good={safety.connected && !info.paused}>{!safety.connected ? "غير متصل" : info.status}</TherapistStatus></div></header>
        <div className={styles.grid}>
          <div className={styles.child}>
            <section className={styles.preview} aria-label="متابعة شاشة الطفل"><div ref={setPreview} className={styles.previewTarget} data-workspace-target="preview" /><div className={styles.fallback}>{artwork && <Image src={artwork} width={640} height={360} alt="صورة تمثيلية من النشاط" />}<p>صورة النشاط · تابع الحالة والإجراءات من أدوات الأخصائي.</p></div></section>
            <section className={styles.assistance} aria-label="مساعدة الطفل"><h2>مساعدة الطفل</h2><div ref={setAssistance} data-workspace-target="assistance" className={styles.assistanceTarget} /><p className={styles.noActions}>استخدم أدوات التفاعل داخل المعاينة.</p></section>
          </div>
          <aside className={styles.therapist} aria-label="لوحة الأخصائي"><h2>لوحة الأخصائي</h2><div ref={setProgress} data-workspace-target="progress" className={styles.progress} /><div ref={setNavigation} data-workspace-target="navigation" className={styles.navigation} /><div ref={setSession} data-workspace-target="session" className={styles.session} /><div ref={setSettings} data-workspace-target="settings" className={styles.settings} /><p className={styles.settingsHint}>عدّل الخيارات المقفلة أثناء الاستراحة.</p></aside>
        </div>
      </div>
      {children}
    </div>
  </Context.Provider>;
}

/** This wrapper stays mounted across Start/End. Native controller and physical input effects never remount on layout changes. */
export function WorkspaceNative({ children, className }: { children: ReactNode; className: string }) {
  const { active } = useControlWorkspace();
  return <div className={styles.nativeOptions}><div hidden={active} className={className}>{children}</div></div>;
}
export function SetupOnly({ children }: { children: ReactNode }) {
  const { active } = useControlWorkspace();
  return <div hidden={active}>{children}</div>;
}
