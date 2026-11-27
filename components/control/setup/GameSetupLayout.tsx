"use client";
import type { ReactNode } from "react";
import { StagePicker, type StageChoice } from "./ProgressiveStages";
import styles from "./controlSetup.module.css";
import { SetupStart, useControlWorkspace } from "@/components/control/ui/ControlWorkspace";
/**
 * Essentials only: options a game promotes with ControlSlot render in the card. Every other native setting stays mounted
 * (same handlers, same safe defaults) but is not offered here; the owner decides per game which ones are promoted.
 */
export function SetupSettingsCard({ children }: { children: ReactNode }) {
  const { available, registerSetup } = useControlWorkspace();
  return <section className={styles.settings} aria-label="إعدادات اللعبة" data-setup-section="settings"><h2>إعداد المشاركة</h2>{available ? <><div ref={registerSetup} className={styles.essentials} data-setup-essential /><div hidden data-setup-deferred>{children}</div></> : children}</section>;
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
        <SetupStart><button
          type="button"
          data-testid={startTestId}
          disabled={disabled}
          onClick={onStart}
        >
          ابدأ النشاط
        </button></SetupStart>
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
        <SetupStart>{start}</SetupStart>
      </section>
    </div>
  );
}
