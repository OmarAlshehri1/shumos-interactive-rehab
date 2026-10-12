import { randomUUID } from "node:crypto";
import { roomValid } from "@/lib/buildquest3d/protocol";
import { notFound, redirect } from "next/navigation";
import { buildQuestAvailable } from "@/lib/buildquest3d/registration";
import { requestedInput } from "@/lib/games/library/capabilities";
import { BuildQuestControl } from "@/components/control/buildquest3d/BuildQuestControl";
export const metadata = {
  title: "عالم البناء — التحكم",
  robots: { index: false, follow: false },
};
/** Inherits StaffAuthGate; session and sensor pointer transport remain browser-local. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ session?: string | string[]; input?: string | string[] }>;
}) {
  if (
    !buildQuestAvailable(
      process.env.NODE_ENV,
      process.env.NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED,
    )
  )
    notFound();
  const { session, input } = await searchParams;
  if (!roomValid(session))
    redirect(`/control/build-quest-3d?session=${randomUUID()}${typeof input === "string" ? `&input=${requestedInput(input)}` : ""}`);
  return <BuildQuestControl />;
}
