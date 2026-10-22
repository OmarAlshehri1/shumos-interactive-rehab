"use client";

import { ControlDialog } from "@/components/control/ui/ControlDialog";
import { TherapistButton } from "@/components/control/ui/TherapistSurface";

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Shared centered confirmation; original native action callbacks remain authoritative. */
export function ConfirmSheet({ open, title, description, confirmLabel, destructive, onConfirm, onCancel }: ConfirmSheetProps) {
  return <ControlDialog open={open} title={title} onClose={onCancel} role="alertdialog">
    <h2>{title}</h2><p>{description}</p><div>
      <TherapistButton autoFocus onClick={onCancel}>إلغاء</TherapistButton>
      <TherapistButton tone={destructive ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</TherapistButton>
    </div>
  </ControlDialog>;
}
