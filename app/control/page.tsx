import type { Metadata } from "next";
import { ControlScreen } from "@/components/control/ControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — Control",
};

export default function ControlPage() {
  return <ControlScreen />;
}
