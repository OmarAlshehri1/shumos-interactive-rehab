import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./control.css";

const plexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-control",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * A different, more restrained Arabic typeface than /display's playful
 * Baloo Bhaijaan 2 (see app/display/layout.tsx) — the therapist controller
 * is a professional clinical tool, not the child-facing game, and should
 * read that way typographically. Route-scoped the same way, so this never
 * affects /display.
 */
export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${plexSansArabic.variable} contents`}>{children}</div>;
}
