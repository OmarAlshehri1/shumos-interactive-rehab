import type { Metadata } from "next";
import { GameLibraryScreen } from "@/components/control/library/GameLibraryScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — الأنشطة",
};

export default function ActivitiesPage() {
  return <GameLibraryScreen />;
}
