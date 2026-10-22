"use client";
import { useRef, useState, type ReactNode } from "react";
import { ControlDialog } from "./ControlDialog";
import { TherapistButton } from "./TherapistSurface";
interface Request { title: string; description: string; confirmLabel: string; action: () => void | Promise<void> }
/** Native dialog supplies focus trapping, inert background and focus restoration. No browser confirm(). */
export function useTherapistConfirmation(): { ask: (request: Request) => void; dialog: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const cancel = () => { if (!submitted.current) setRequest(null); };
  const accept = async () => {
    if (!request || submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try { await request.action(); setRequest(null); }
    catch { setError("تعذّر إتمام الإجراء. لم يتأكد حفظ التغييرات؛ حاول مجددًا."); }
    finally { submitted.current = false; setBusy(false); }
  };
  const dialog = request ? <ControlDialog open title={request.title} onClose={cancel} busy={busy}>
    <h2>{request.title}</h2><p>{request.description}</p>
    {error && <p role="alert">{error}</p>}
    <div><TherapistButton autoFocus onClick={cancel}>إلغاء</TherapistButton><TherapistButton tone="danger" onClick={() => void accept()}>{request.confirmLabel}</TherapistButton></div>
  </ControlDialog> : null;
  return { ask: next => { if (!submitted.current) { setError(""); setRequest(next); } }, dialog };
}
