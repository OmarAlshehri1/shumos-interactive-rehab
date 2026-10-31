import type { SVGProps } from "react";

export type ControlIconName = "home" | "activities" | "patients" | "youtube" | "arrow" | "plus" | "logout" | "calibrate" | "eye" | "eyeOff" | "shield" | "spark";

const paths: Record<ControlIconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/></>,
  activities: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  patients: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/></>,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/></>,
  arrow: <path d="M19 12H5m6-6-6 6 6 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  logout: <><path d="M9 4H4v16h5m5-12 4 4-4 4M8 12h12"/></>,
  calibrate: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M12 7v10m-5-5h10"/><circle cx="12" cy="12" r="3"/></>,
  eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="m3 3 18 18M10.6 5.1 12 5c7 0 10 7 10 7a18 18 0 0 1-3.4 4.4M6 6.5A19 19 0 0 0 2 12s3 7 10 7a12 12 0 0 0 5.5-1.4M10 10a3 3 0 0 0 4 4"/></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></>,
};

export function ControlIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: ControlIconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
