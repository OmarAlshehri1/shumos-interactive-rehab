"use client";
import type { ReactNode } from "react";
import { StagePicker, type StageChoice } from "./ProgressiveStages";
import styles from "./controlSetup.module.css";
import { useControlWorkspace } from "@/components/control/ui/ControlWorkspace";
import { TherapistDisclosure } from "@/components/control/ui/TherapistSurface";
export function SetupSettingsCard({ children }: { children: ReactNode }) {
  const { available, registerSetup } = useControlWorkspace();
  return <section className={styles.settings} aria-label="إعدادات اللعبة" data-setup-section="settings"><h2>إعداد المشاركة</h2>{available ? <><div ref={registerSetup} className={styles.essentials} data-setup-essential /><p className={styles.essentialHint}>اختر مشاركة مريحة، وراجع مساحة الحركة قبل البدء.</p><TherapistDisclosure>{children}</TherapistDisclosure></> : children}</section>;
}
export function GameSetupLayout({
  settings,
  items,
  value,
  onSelect,
  onStart,
  disabled,
  startTestId,
}: {
  settings: ReactNode;
  items: readonly StageChoice[];
  value: string | number;
  onSelect: (v: string | number) => void;
  onStart: () => void;
  disabled: boolean;
  startTestId?: string;
}) {
  return (
    <div className={styles.layout} data-game-setup>
      <SetupSettingsCard>
        {settings}
      </SetupSettingsCard>
      <section className={styles.stages} data-setup-section="levels" aria-label="المستويات">
        <h2>المستويات</h2>
        <StagePicker
          items={items}
          value={value}
          onSelect={onSelect}
          disabled={disabled}
        />
      </section>
      <section className={styles.start}>
        <p>راجع الإعدادات ومساحة الحركة قبل البدء.</p>
        <button
          type="button"
          data-testid={startTestId}
          disabled={disabled}
          onClick={onStart}
        >
          ابدأ النشاط
        </button>
      </section>
    </div>
  );
}

/** Native settings, selectors and Start handlers are retained as elements. */
export function NativeSetupSections({
  settings,
  stages,
  start,
}: {
  settings: ReactNode;
  stages: ReactNode;
  start: ReactNode;
}) {
  return (
    <div className={styles.layout} data-game-setup>
      <SetupSettingsCard>{settings}</SetupSettingsCard>
      <section className={styles.stages} data-setup-section="levels" aria-label="المستويات">
        <h2>المستويات</h2>
        {stages}
      </section>
      <section className={styles.start}>
        <p>راجع الإعدادات ومساحة الحركة قبل البدء.</p>
        {start}
      </section>
    </div>
  );
}
