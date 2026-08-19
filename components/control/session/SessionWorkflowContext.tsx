"use client";

import { createContext, useContext } from "react";

interface SessionWorkflowContextValue {
  /** Session Goal was removed from the current workflow. Kept as an
   * explicit undefined value so the stable game adapters need no risky
   * lifecycle refactor immediately before deployment. */
  metadata: undefined;
  reset: () => void;
}

const SessionWorkflowContext = createContext<SessionWorkflowContextValue | null>(null);
const DISABLED_WORKFLOW: SessionWorkflowContextValue = { metadata: undefined, reset: () => {} };

export function SessionWorkflowProvider({ children }: { children: React.ReactNode }) {
  return <SessionWorkflowContext.Provider value={DISABLED_WORKFLOW}>{children}</SessionWorkflowContext.Provider>;
}

export function useSessionWorkflow(): SessionWorkflowContextValue {
  const value = useContext(SessionWorkflowContext);
  if (!value) throw new Error("useSessionWorkflow must be used within SessionWorkflowProvider");
  return value;
}
