"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type ButtonHTMLAttributes,
} from "react";
import { ControlSlot, useControlWorkspace } from "@/components/control/ui/ControlWorkspace";
import { useControlGameId } from "./ControlGameFrame";
import { realGameThumbnail } from "@/components/control/library/realGameThumbnails";
import { StageArtwork } from "./StageArtwork";
import styles from "./progressive.module.css";
export interface StageChoice {
  value: string | number;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
}
export function stageLevel(index: number) {
  return Math.floor(Math.max(0, index) / 3);
}
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node))
    return textOf(node.props.children);
  return "";
}
export function optionsOf(node: ReactNode): StageChoice[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<{
      value?: string | number;
      disabled?: boolean;
      "data-stage-description"?: string;
      children?: ReactNode;
    }>(child)
      ? child.type === "option"
        ? [
            {
              value: child.props.value ?? textOf(child.props.children),
              label: child.props.children,
              description: child.props["data-stage-description"],
              disabled: child.props.disabled,
            },
          ]
        : optionsOf(child.props.children)
      : [],
  );
}
const LEVELS = ["سهل", "متوسط", "متقدم"];
/** A difficulty chooses its first permitted native stage; only the resulting native value is shown as selected. */
export function StagePicker({
  items,
  value,
  disabled = false,
  onSelect,
}: {
  items: readonly StageChoice[];
  value: string | number;
  disabled?: boolean;
  onSelect: (value: string | number) => void;
}) {
  const gameId = useControlGameId();
  const { active } = useControlWorkspace();
  const selected = items.findIndex(
    (item) => String(item.value) === String(value),
  );
  const level = stageLevel(selected);
  return (
    <>
    {active && selected >= 0 && <ControlSlot slot="navigation"><button type="button" disabled={disabled || selected <= 0 || items[selected - 1]?.disabled} onClick={() => onSelect(items[selected - 1].value)}>المرحلة السابقة</button><button type="button" disabled={disabled || selected >= items.length - 1 || items[selected + 1]?.disabled} onClick={() => onSelect(items[selected + 1].value)}>المرحلة التالية</button></ControlSlot>}
    {active && selected >= 0 && <ControlSlot slot="progress"><strong>{items[selected].label}</strong><p>المرحلة {selected + 1} من {items.length}</p></ControlSlot>}
    <div className={styles.picker} data-progressive-stages>
      <div className={styles.levels} role="group" aria-label="مستوى الصعوبة">
        {LEVELS.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={level === index}
            disabled={
              disabled ||
              items
                .slice(index * 3, index * 3 + 3)
                .every((item) => item.disabled)
            }
            onClick={() => {
              const next = items
                .slice(index * 3, index * 3 + 3)
                .find((item) => !item.disabled);
              if (next) onSelect(next.value);
            }}
          >
            المستوى {index + 1}
            <strong>{label}</strong>
          </button>
        ))}
      </div>
      <div className={styles.stages} aria-label={`مراحل المستوى ${level + 1}`}>
        {items.slice(level * 3, level * 3 + 3).map((item, i) => (
          <button
            type="button"
            key={item.value}
            disabled={disabled || item.disabled}
            aria-pressed={String(item.value) === String(value)}
            data-stage-choice={item.value}
            onClick={() => onSelect(item.value)}
          >
            <StageArtwork
              gameId={gameId}
              index={level * 3 + i}
              fallback={gameId ? realGameThumbnail(gameId) : undefined}
            />
            <span>المرحلة {level * 3 + i + 1}</span>
            <strong>
              {textOf(item.label)
                .replace(/^المستوى\s+[^·]+·\s*/, "")
                .replace(/^المرحلة\s+\d+\s*·\s*/, "")
                .replace(/^\d+\s*·\s*\d+\s*[—-]\s*/, "")
                .replace(/^\d+\s*·\s*/, "")}
            </strong>
            {item.description && <small>{item.description}</small>}
          </button>
        ))}
      </div>
    </div>
    </>
  );
}
/** Preserves each native select's value, disabled options and configuration handler. */
export function ProgressiveStageSelect({
  children,
  onSelect,
}: {
  children: ReactElement<SelectHTMLAttributes<HTMLSelectElement>>;
  onSelect: (value: string | number) => void;
}) {
  const items = optionsOf(children.props.children);
  if (items.length !== 9) return children;
  return (
    <>
      <StagePicker
        items={items}
        value={String(children.props.value ?? "0")}
        disabled={children.props.disabled}
        onSelect={onSelect}
      />
      {cloneElement(children, {
        "aria-hidden": true,
        tabIndex: -1,
        style: { ...children.props.style, display: "none" },
      })}
    </>
  );
}
/** Native button grids use the same progressive layout without changing their handlers. */
export function ProgressiveStageGroup({
  children,
  selected,
}: {
  children: ReactNode;
  selected: number;
}) {
  const gameId = useControlGameId();
  const { active } = useControlWorkspace();
  const nodes = Children.toArray(children);
  const level = stageLevel(selected);
  const candidate = (index: number) =>
    nodes
      .slice(index * 3, index * 3 + 3)
      .find(
        (node) =>
          isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(node) &&
          !node.props.disabled &&
          node.props.onClick,
      ) as ReactElement<ButtonHTMLAttributes<HTMLButtonElement>> | undefined;
  if (nodes.length !== 9) return <>{children}</>;
  return (
    <>
    {active && nodes[selected] && <ControlSlot slot="navigation">{[-1, 1].map(delta => {
      const target = nodes[selected + delta];
      return isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(target) ? cloneElement(target, { key: delta, children: delta < 0 ? "المرحلة السابقة" : "المرحلة التالية" }) : <button key={delta} type="button" disabled>{delta < 0 ? "المرحلة السابقة" : "المرحلة التالية"}</button>;
    })}</ControlSlot>}
    {active && nodes[selected] && <ControlSlot slot="progress"><strong>{textOf(nodes[selected])}</strong><p>المرحلة {selected + 1} من {nodes.length}</p></ControlSlot>}
    <div className={styles.picker} data-progressive-stages>
      <div className={styles.levels} role="group" aria-label="مستوى الصعوبة">
        {LEVELS.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={level === index}
            disabled={!candidate(index)}
            onClick={(event) => candidate(index)?.props.onClick?.(event)}
          >
            المستوى {index + 1}
            <strong>{label}</strong>
          </button>
        ))}
      </div>
      <div className={styles.stages}>
        {nodes.slice(level * 3, level * 3 + 3).map((node, i) =>
          isValidElement(node)
            ? cloneElement(
                node as ReactElement<{
                  "aria-pressed"?: boolean;
                  "data-stage-choice"?: number;
                  children?: ReactNode;
                }>,
                {
                  "aria-pressed": level * 3 + i === selected,
                  "data-stage-choice": level * 3 + i,
                  children: (
                    <>
                      <StageArtwork
                        gameId={gameId}
                        index={level * 3 + i}
                        fallback={
                          gameId ? realGameThumbnail(gameId) : undefined
                        }
                      />
                      {
                        (node as ReactElement<{ children?: ReactNode }>).props
                          .children
                      }
                    </>
                  ),
                },
              )
            : node,
        )}
      </div>
    </div>
    </>
  );
}
export function AdditionalOptions({
  children,
  title = "خيارات إضافية",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <details className={styles.additional}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}
