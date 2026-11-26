import type { ReactNode } from "react";
import { formatInteger } from "./formatting";

export function SectionHead({ detail, eyebrow, title, headingLevel = 2 }: { detail?: ReactNode; eyebrow: string; title: string; headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <Heading>{title}</Heading>
      </div>
      {detail && <span>{detail}</span>}
    </header>
  );
}

export function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <strong>{typeof value === "number" ? formatInteger(value) : value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: "strong" }) {
  return <span className={`pill ${tone === "strong" ? "strong" : ""}`}>{children}</span>;
}

export function EmptyState({ body, icon, title }: { body: string; icon: ReactNode; title: string }) {
  return (
    <section className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </section>
  );
}
