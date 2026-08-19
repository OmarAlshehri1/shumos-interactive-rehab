export const THERAPIST_NOTE_MAX_LENGTH = 750;
export const CUSTOM_SESSION_GOAL_MAX_LENGTH = 100;
export const CUSTOM_END_REASON_MAX_LENGTH = 120;
export const THERAPIST_NAME_MAX_LENGTH = 80;

export type SessionGoal =
  | "MOVEMENT_REACH"
  | "VISUAL_DISCRIMINATION"
  | "FOLLOWING_INSTRUCTIONS"
  | "BALANCE_TRANSITION"
  | "INTERACTION_RESPONSE"
  | "OTHER";

export type SessionEndReason = "CHILD_SATISFIED" | "CHILD_TIRED" | "CHANGE_ACTIVITY" | "OTHER";

export interface EarlyEndSelection {
  reason: SessionEndReason | null;
  customReason: string;
}

/** Optional organizational metadata only; game engines and scoring never read it. */
export interface SessionWorkflowMetadata {
  sessionGoal?: SessionGoal;
  customSessionGoal?: string;
  endReason?: SessionEndReason;
  customEndReason?: string;
}

/** Shared optional fields on every permanent game-history record. */
export interface StoredSessionWorkflowFields extends SessionWorkflowMetadata {
  /** Stable therapist identity already used by history is `createdByUid`; this is display-only. */
  therapistName?: string;
  therapistNote?: string;
}

export const SESSION_GOAL_LABELS: Record<SessionGoal, string> = {
  MOVEMENT_REACH: "حركة ووصول",
  VISUAL_DISCRIMINATION: "تمييز بصري",
  FOLLOWING_INSTRUCTIONS: "اتباع التعليمات",
  BALANCE_TRANSITION: "توازن وانتقال",
  INTERACTION_RESPONSE: "تفاعل واستجابة",
  OTHER: "أخرى",
};

export const SESSION_END_REASON_LABELS: Record<SessionEndReason, string> = {
  CHILD_SATISFIED: "اكتفى الطفل",
  CHILD_TIRED: "تعب الطفل",
  CHANGE_ACTIVITY: "تغيير النشاط",
  OTHER: "سبب آخر",
};

export function trimToLimit(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function withEarlyEndReason(
  metadata: SessionWorkflowMetadata | undefined,
  reason: SessionEndReason | null,
  customReason: string,
): SessionWorkflowMetadata | undefined {
  if (!reason) return metadata;
  const customEndReason = reason === "OTHER" ? trimToLimit(customReason, CUSTOM_END_REASON_MAX_LENGTH) : "";
  return {
    ...metadata,
    endReason: reason,
    ...(customEndReason ? { customEndReason } : {}),
  };
}

export function applyEarlyEndReason<T extends { workflow?: SessionWorkflowMetadata }>(
  session: T,
  reason: SessionEndReason | null,
  customReason: string,
): T {
  const workflow = withEarlyEndReason(session.workflow, reason, customReason);
  return workflow ? { ...session, workflow } : session;
}

export function workflowFieldsForStorage(
  metadata: SessionWorkflowMetadata | undefined,
  therapistName: string | null | undefined,
): StoredSessionWorkflowFields {
  const safeTherapistName = therapistName ? trimToLimit(therapistName, THERAPIST_NAME_MAX_LENGTH) : "";
  const safeMetadata = normalizeSessionWorkflowMetadata(metadata);
  return {
    // Session Goal is legacy-read-only. Keep its parser/types/rules so old
    // history remains compatible, but never copy it into a newly stored
    // session. Early-end metadata remains fully supported.
    ...(safeMetadata?.endReason ? { endReason: safeMetadata.endReason } : {}),
    ...(safeMetadata?.customEndReason ? { customEndReason: safeMetadata.customEndReason } : {}),
    ...(safeTherapistName ? { therapistName: safeTherapistName } : {}),
  };
}

/** Defensive boundary for legacy/realtime values that cannot be trusted to match TypeScript. */
export function normalizeSessionWorkflowMetadata(raw: unknown): SessionWorkflowMetadata | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const goal = typeof value.sessionGoal === "string" && value.sessionGoal in SESSION_GOAL_LABELS
    ? value.sessionGoal as SessionGoal
    : null;
  const endReason = typeof value.endReason === "string" && value.endReason in SESSION_END_REASON_LABELS
    ? value.endReason as SessionEndReason
    : null;
  const customSessionGoal = goal === "OTHER" && typeof value.customSessionGoal === "string"
    ? trimToLimit(value.customSessionGoal, CUSTOM_SESSION_GOAL_MAX_LENGTH)
    : "";
  const customEndReason = endReason === "OTHER" && typeof value.customEndReason === "string"
    ? trimToLimit(value.customEndReason, CUSTOM_END_REASON_MAX_LENGTH)
    : "";
  if (!goal && !endReason) return undefined;
  return {
    ...(goal ? { sessionGoal: goal } : {}),
    ...(customSessionGoal ? { customSessionGoal } : {}),
    ...(endReason ? { endReason } : {}),
    ...(customEndReason ? { customEndReason } : {}),
  };
}

export function sessionGoalLabel(metadata: SessionWorkflowMetadata | StoredSessionWorkflowFields | undefined): string | null {
  if (!metadata?.sessionGoal) return null;
  if (metadata.sessionGoal === "OTHER" && metadata.customSessionGoal) return metadata.customSessionGoal;
  return SESSION_GOAL_LABELS[metadata.sessionGoal];
}

export function sessionEndReasonLabel(metadata: SessionWorkflowMetadata | StoredSessionWorkflowFields | undefined): string | null {
  if (!metadata?.endReason) return null;
  if (metadata.endReason === "OTHER" && metadata.customEndReason) return metadata.customEndReason;
  return SESSION_END_REASON_LABELS[metadata.endReason];
}

export function normalizeTherapistNote(note: string): string {
  return trimToLimit(note, THERAPIST_NOTE_MAX_LENGTH);
}
