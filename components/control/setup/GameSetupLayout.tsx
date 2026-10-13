"use client";
import type { ReactNode } from "react";
import { StagePicker, type StageChoice } from "./ProgressiveStages";
import styles from "./controlSetup.module.css";
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
      <section className={styles.settings} aria-label="إعدادات النشاط">
        {settings}
      </section>
      <section className={styles.stages}>
        <h2>اختر المستوى والمرحلة</h2>
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
      <section className={styles.settings}>{settings}</section>
      <section className={styles.stages}>
        <h2>اختر المستوى والمرحلة</h2>
        {stages}
      </section>
      <section className={styles.start}>
        <p>راجع الإعدادات ومساحة الحركة قبل البدء.</p>
        {start}
      </section>
    </div>
  );
}
