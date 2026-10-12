import { notFound } from "next/navigation";
import { buildQuestAvailable } from "@/lib/buildquest3d/registration";
import { BuildQuestDisplayEntry } from "@/components/display/buildquest3d/BuildQuestDisplayEntry";
export const metadata = {
  title: "عالم البناء — Build Quest 3D",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (
    !buildQuestAvailable(
      process.env.NODE_ENV,
      process.env.NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED,
    )
  )
    notFound();
  return <BuildQuestDisplayEntry />;
}
