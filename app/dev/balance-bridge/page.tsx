import { notFound } from "next/navigation";
import { LocalBridge } from "@/components/balancebridge3d/BridgeControl";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LocalBridge />;
}
