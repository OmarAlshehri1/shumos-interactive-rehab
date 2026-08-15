import type { Metadata } from "next";
import { HomeScreen } from "@/components/control/home/HomeScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — الرئيسية",
};

export default function ControlPage() {
  return <HomeScreen />;
}
