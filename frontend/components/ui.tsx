import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CircleCheck, CircleDotDashed, CircleX, FlaskConical } from "lucide-react";
import type { ServiceState } from "@/lib/types";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <header className="border-b border-line px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-[-0.04em] text-ink sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted sm:text-base">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

const stateConfig: Record<ServiceState, { label: string; className: string; icon: LucideIcon }> = {
  operational: { label: "Operational", className: "border-accent/40 bg-accent/10 text-[#7bedaa]", icon: CircleCheck },
  degraded: { label: "Degraded", className: "border-warning/40 bg-warning/10 text-[#fcd96b]", icon: AlertTriangle },
  down: { label: "Unavailable", className: "border-danger/40 bg-danger/10 text-[#fda4af]", icon: CircleX },
  unknown: { label: "Unknown", className: "border-line-strong bg-surface-3 text-ink-muted", icon: CircleDotDashed },
};

export function StatusBadge({ state, label }: { state: ServiceState; label?: string }) {
  const config = stateConfig[state];
  const Icon = config.icon;
  return (
    <span className={`inline-flex min-h-7 items-center gap-1.5 border px-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${config.className}`}>
      <Icon size={12} aria-hidden="true" /> {label ?? config.label}
    </span>
  );
}

export function DemoBadge({ label = "Demo data" }: { label?: string }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 border border-info/40 bg-info/10 px-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#9bd2ff]" title="Live API unavailable; representative data is shown.">
      <FlaskConical size={12} aria-hidden="true" /> {label}
    </span>
  );
}

export function MetricCard({ label, value, detail, icon: Icon, status }: { label: string; value: string; detail: string; icon: LucideIcon; status?: "positive" | "warning" | "neutral" }) {
  return (
    <article className="panel min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="eyebrow leading-5">{label}</p>
        <Icon size={18} className="shrink-0 text-ink-faint" aria-hidden="true" />
      </div>
      <p className="data-value mt-5 text-2xl font-semibold text-ink sm:text-[1.75rem]">{value}</p>
      <p className={`mt-2 text-xs ${status === "positive" ? "text-[#7bedaa]" : status === "warning" ? "text-[#fcd96b]" : "text-ink-muted"}`}>{detail}</p>
    </article>
  );
}

export function SectionPanel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel min-w-0 ${className}`}>
      <div className="flex min-h-16 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div>
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h2 className="font-mono text-sm font-semibold tracking-tight text-ink">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden="true" />;
}

export function LoadingGrid() {
  return (
    <div role="status" aria-label="Loading dashboard" className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div className="bg-surface-1 p-5" key={item}>
          <Skeleton className="h-3 w-24" /><Skeleton className="mt-6 h-8 w-32" /><Skeleton className="mt-3 h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="grid size-12 place-items-center border border-line bg-surface-2 text-ink-muted"><Icon size={22} aria-hidden="true" /></span>
      <h3 className="mt-4 font-mono text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
