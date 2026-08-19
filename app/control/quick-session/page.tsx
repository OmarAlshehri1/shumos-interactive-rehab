import type { Metadata } from "next";
import { QuickSessionScreen } from "@/components/control/quick-session/QuickSessionScreen";

export const metadata: Metadata = { title: "Shumos Interactive Rehab — جلسة سريعة" };

export default function QuickSessionPage() {
  return <QuickSessionScreen />;
}
