"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { modalKeys } from "@/components/control/visits/modalKeys";
import { createPortal } from "react-dom";
import styles from "./confirmation.module.css";
/** One Control modal surface. The top layer supplies focus containment and restores the opener. */
export function ControlDialog({ open, title, onClose, busy = false, children, role = "dialog" }: {
  open: boolean; title: string; onClose: () => void; busy?: boolean; children: ReactNode; role?: "dialog" | "alertdialog";
}) {
  const host = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = host.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    const formField = element?.querySelector<HTMLInputElement>("form input:not([type=hidden])");
    if (formField) formField.focus();
    else if (element && !element.querySelector("[autofocus]")) {
      const cancel = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(button => /إلغاء|رجوع|عودة|^لا$/.test(button.textContent?.trim() ?? ""));
      cancel?.focus();
    }
    return () => {
      element?.close();
      if (opener?.isConnected && !element?.contains(opener)) opener.focus();
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<dialog ref={host} className={styles.dialog} dir="rtl" lang="ar" role={role} aria-label={title} aria-busy={busy} data-control-dialog tabIndex={-1} onKeyDown={event => { event.stopPropagation(); modalKeys(event, () => { if (!busy) onClose(); }); }} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <fieldset disabled={busy} className={styles.content}>{children}</fieldset>
    {busy && <p role="status" className={styles.pending}>جارٍ تنفيذ الإجراء…</p>}
  </dialog>, document.querySelector(".shumos-control") ?? document.body);
}
