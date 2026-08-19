import { CHASE_COLOR_LABELS_AR, type ChaseColor } from "@/lib/colorchase";

export const colorChaseWelcomeLine = (childName: string) => `مرحباً ${childName}! هيا نطارد الألوان!`;
export const colorChaseReadyLine = () => "قف في منطقة البداية";
export const colorChaseInstructionLine = (instruction: string) => instruction;
export const colorChaseTargetLine = (color: ChaseColor) => CHASE_COLOR_LABELS_AR[color];
export const colorChaseIncorrectLine = () => "حاول مرة ثانية";
export const colorChaseDangerLine = () => "انتبه!";
export const colorChaseStageCompleteLine = (childName: string) => `أحسنت يا ${childName}! أكملت المرحلة`;
export const colorChaseSessionCompleteLine = (childName: string) => `رائع يا ${childName}! أكملت مطاردة الألوان`;
