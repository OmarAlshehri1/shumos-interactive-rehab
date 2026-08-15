import type { Metadata } from "next";
import { DisplayScreen } from "@/components/display/DisplayScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — Display",
};

export default function DisplayPage() {
  return <DisplayScreen />;
}
