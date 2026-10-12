import { Baloo_Bhaijaan_2 } from "next/font/google";
import "./balloon-quest.css";
import "./follow-the-footsteps.css";
import "./bubble-pop-wall.css";
import "./space-pilot.css";

const balooBhaijaan = Baloo_Bhaijaan_2({
  variable: "--font-balloon-quest",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${balooBhaijaan.variable} contents`}>{children}</div>;
}
