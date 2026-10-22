import type { ButtonHTMLAttributes, ReactNode } from "react";
import ui from "./therapist.module.css";

export function TherapistSection({ title, description, step, children }: { title: string; description?: string; step?: string; children: ReactNode }) {
  return <section className={ui.surface} aria-label={title}>
    <header className={ui.sectionHeading}>{step && <span className={ui.step} aria-hidden="true">{step}</span>}<div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>
    {children}
  </section>;
}
export function TherapistDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return <details className={ui.disclosure}><summary>{title}<span aria-hidden="true">＋</span></summary><div className={ui.disclosureBody}>{children}</div></details>;
}
export function TherapistButton({ tone = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "danger" }) {
  return <button type="button" className={`${ui.button} ${ui[tone]} ${className}`} {...props} />;
}
export function TherapistStatus({ children, good = false }: { children: ReactNode; good?: boolean }) {
  return <span className={`${ui.status} ${good ? ui.good : ""}`}><i aria-hidden="true" />{children}</span>;
}
