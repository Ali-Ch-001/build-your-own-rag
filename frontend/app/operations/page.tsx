import type { Metadata } from "next";
import { AlertTriangle, Boxes, Clock3, DatabaseZap, Gauge, HardDrive, Network, RefreshCw, Server, TimerReset } from "lucide-react";
import { DemoBadge, MetricCard, PageHeader, SectionPanel, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Operations" };

const dependencies = [
  { name: "PostgreSQL", role: "Metadata and tenant state", latency: "8 ms", state: "operational" as const },
  { name: "OpenSearch", role: "Lexical and vector retrieval", latency: "42 ms", state: "operational" as const },
  { name: "AWS S3", role: "Source document storage", latency: "31 ms", state: "operational" as const },
  { name: "OpenAI", role: "Embeddings and generation", latency: "612 ms", state: "operational" as const },
  { name: "Tavily", role: "External search connector", latency: "1.24 s", state: "degraded" as const },
];

export default function OperationsPage() {
  return (
    <div>
      <PageHeader eyebrow="Reliability / Operations" title="Infrastructure & SLOs" description="Inspect service objectives, queue pressure, dependency health, and active operational alerts." actions={<><DemoBadge label="Telemetry fixture" /><button className="btn-secondary"><RefreshCw size={16} aria-hidden="true" /> Refresh</button></>} />
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4" aria-label="SLO metrics">
          <MetricCard label="Response P95" value="1.82 s" detail="82.7% of 2.20 s budget" icon={Gauge} status="positive" />
          <MetricCard label="Index freshness" value="04m 18s" detail="Target under 10 minutes" icon={Clock3} status="positive" />
          <MetricCard label="Cache hit rate" value="72.4%" detail="+3.2 pp over seven days" icon={DatabaseZap} status="positive" />
          <MetricCard label="Availability / 30d" value="99.982%" detail="7m 47s error budget used" icon={Server} status="positive" />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
          <SectionPanel title="SLO budget" eyebrow="Rolling 30 days" action={<StatusBadge state="operational" label="Within budget" />}>
            <div className="space-y-6 p-5">
              {[
                { label: "Response availability", current: "99.982%", target: "99.95%", used: 36 },
                { label: "Grounded response latency", current: "1.82 s", target: "2.20 s", used: 58 },
                { label: "Ingestion freshness", current: "4m 18s", target: "10m", used: 43 },
              ].map((slo) => <div key={slo.label}><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-medium">{slo.label}</p><p className="mt-1 text-xs text-ink-faint">Objective {slo.target}</p></div><p className="data-value text-sm">{slo.current}</p></div><div className="mt-3 h-2 bg-surface-3" role="progressbar" aria-label={`${slo.label} budget used`} aria-valuenow={slo.used} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent" style={{ width: `${slo.used}%` }} /></div><p className="mt-1.5 text-right font-mono text-[10px] text-ink-faint">{slo.used}% budget consumed</p></div>)}
            </div>
          </SectionPanel>

          <SectionPanel title="Queue pressure" eyebrow="Current depth by workload">
            <div className="grid gap-px bg-line sm:grid-cols-2">
              {[
                { label: "Response generation", value: 12, detail: "38 workers", icon: Network },
                { label: "Document ingestion", value: 84, detail: "40 workers", icon: Boxes },
                { label: "Embedding batches", value: 31, detail: "16 workers", icon: DatabaseZap },
                { label: "Evaluation jobs", value: 3, detail: "8 workers", icon: TimerReset },
              ].map((queue) => { const Icon = queue.icon; return <div className="bg-surface-1 p-5" key={queue.label}><div className="flex items-start justify-between"><Icon size={18} className="text-ink-faint" aria-hidden="true" /><span className="data-value text-2xl">{queue.value}</span></div><p className="mt-5 text-sm font-medium">{queue.label}</p><p className="mt-1 font-mono text-xs text-ink-faint">{queue.detail} available</p></div>; })}
            </div>
          </SectionPanel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionPanel title="Dependencies" eyebrow="External and stateful services">
            <ul className="divide-y divide-line">{dependencies.map((dependency) => <li key={dependency.name} className="flex flex-wrap items-center gap-3 px-5 py-4"><HardDrive size={17} className="text-ink-faint" aria-hidden="true" /><div className="min-w-[180px] flex-1"><p className="text-sm font-medium">{dependency.name}</p><p className="mt-0.5 text-xs text-ink-faint">{dependency.role}</p></div><span className="w-16 font-mono text-xs text-ink-muted">{dependency.latency}</span><StatusBadge state={dependency.state} /></li>)}</ul>
          </SectionPanel>

          <SectionPanel title="Active alerts" eyebrow="Routing / platform-oncall" action={<span className="font-mono text-xs text-warning">1 open</span>}>
            <div className="border-l-2 border-l-warning p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-warning" size={19} aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-mono text-sm font-semibold">Tavily P95 latency elevated</h3><StatusBadge state="degraded" label="Warning" /></div><p className="mt-2 text-sm leading-6 text-ink-muted">External search latency exceeded 1.2 seconds for 6 consecutive minutes. Grounded corpus retrieval is unaffected.</p><p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-ink-faint">Opened 08:41 UTC / OPS-1842</p></div></div></div>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}
