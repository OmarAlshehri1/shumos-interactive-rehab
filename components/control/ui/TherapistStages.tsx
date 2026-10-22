"use client";
import Image from "next/image";
import styles from "./therapistStages.module.css";
export interface TherapistStage { name: string; description: string; image: string }
/** Selection is the native stage index; this component owns no game state. */
export function TherapistStages({ stages, selected, disabled, onSelect }: { stages: readonly TherapistStage[]; selected: number; disabled: boolean; onSelect: (index: number) => void }) {
  const level = Math.floor(selected / 3);
  return <div className={styles.picker}>
    <div className={styles.levels} role="group" aria-label="مستوى الصعوبة">{["سهل", "متوسط", "متقدم"].map((name, i) => <button key={name} type="button" disabled={disabled} aria-pressed={level === i} onClick={() => onSelect(i * 3)}><span>المستوى {i + 1}</span><strong>{name}</strong></button>)}</div>
    <div className={styles.cards} role="group" aria-label={`مراحل المستوى ${level + 1}`}>{stages.slice(level * 3, level * 3 + 3).map((stage, i) => {
      const index = level * 3 + i;
      return <button key={index} type="button" data-stage-choice={index} disabled={disabled} aria-pressed={index === selected} onClick={() => onSelect(index)}>
        <div className={styles.picture}><Image src={stage.image} alt={`من اللعب الفعلي: ${stage.name}`} width={480} height={270} sizes="(max-width:600px) 90vw, 30vw" /><span>{index === selected ? "✓ المرحلة المختارة" : `المرحلة ${index + 1}`}</span></div>
        <div className={styles.copy}><strong>{stage.name}</strong><p>{stage.description}</p></div>
      </button>;
    })}</div>
  </div>;
}
