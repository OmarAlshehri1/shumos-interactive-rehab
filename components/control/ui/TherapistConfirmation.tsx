"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TherapistButton } from "./TherapistSurface";
import styles from "./confirmation.module.css";
interface Request { title: string; description: string; confirmLabel: string; action: () => void | Promise<void> }
/** Native dialog supplies focus trapping, inert background and focus restoration. No browser confirm(). */
export function useTherapistConfirmation(): { ask: (request: Request) => void; dialog: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState("");
  const host = useRef<HTMLDialogElement>(null), submitted = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!request) return;
    const element = host.current;
    element?.showModal();
    return () => element?.close();
  }, [request]);
  const cancel = () => { if (!submitted.current) setRequest(null); };
  const accept = async () => {
    if (!request || submitted.current) return;
    submitted.current = true;
    try { await request.action(); setRequest(null); }
    catch { setError("تعذّر إتمام الإجراء. لم يتأكد حفظ التغييرات؛ حاول مجددًا."); }
    finally { submitted.current = false; }
  };
  const dialog = request && typeof document !== "undefined" ? createPortal(<dialog ref={host} className={styles.dialog} lang="ar" dir="rtl" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); cancel(); }}>
    <h2 id={`${id}-title`}>{request.title}</h2><p id={`${id}-description`}>{request.description}</p>
    {error && <p role="alert">{error}</p>}
    <div><TherapistButton autoFocus onClick={cancel}>إلغاء والعودة</TherapistButton><TherapistButton tone="danger" onClick={() => void accept()}>{request.confirmLabel}</TherapistButton></div>
  </dialog>, document.body) : null;
  return { ask: next => { if (!submitted.current) { setError(""); setRequest(next); } }, dialog };
}
