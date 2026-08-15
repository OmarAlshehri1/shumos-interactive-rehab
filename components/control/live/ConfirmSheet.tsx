"use client";

import { AnimatePresence, motion } from "motion/react";

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Polished touch-friendly confirmation surface for the controller's
 * destructive/disruptive actions (restart stage, skip stage, end session) —
 * used instead of the browser's blocking `confirm()`, per spec. A bottom
 * sheet rather than a centered modal: it's reachable with a thumb without
 * the therapist having to look away from the child to find a small "OK"
 * button in the middle of the screen.
 */
export function ConfirmSheet({ open, title, description, confirmLabel, destructive, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-slate-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="mx-auto flex w-full max-w-md flex-col gap-5">
              <div className="flex flex-col gap-1.5 text-center">
                <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                <p className="text-sm text-slate-500">{description}</p>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={onConfirm}
                  className={`min-h-14 touch-manipulation rounded-2xl text-base font-bold text-white transition-all active:scale-[0.98] ${
                    destructive ? "bg-rose-600" : "bg-teal-600"
                  }`}
                >
                  {confirmLabel}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="min-h-12 touch-manipulation rounded-2xl text-base font-medium text-slate-500 active:text-slate-700"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
