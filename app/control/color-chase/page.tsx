import type { Metadata } from "next";
import { ColorChaseControlScreen } from "@/components/control/colorchase/ColorChaseControlScreen";

export const metadata: Metadata = { title: "Shumos Interactive Rehab — مطاردة الألوان" };
export default function ColorChasePage() { return <ColorChaseControlScreen />; }
