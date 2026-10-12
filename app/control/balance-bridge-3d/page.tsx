import { notFound } from "next/navigation";
import { BALANCE_BRIDGE_ENABLED } from "@/lib/balancebridge3d/registration";
import { BridgeControl } from "@/components/balancebridge3d/BridgeControl";
export default function Page() {
  if (!BALANCE_BRIDGE_ENABLED) notFound();
  return <BridgeControl />;
}
