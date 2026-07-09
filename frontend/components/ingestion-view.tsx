"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Clock3, FileSearch, Layers3, RefreshCw, ScanText, Split, UploadCloud } from "lucide-react";
import { DemoBadge, MetricCard, PageHeader, SectionPanel, StatusBadge } from "@/components/ui";

const stages = [
  { name: "Received", count: 24, rate: "4,108/h", icon: UploadCloud, state: "active" },
  { name: "Extract", count: 18, rate: "3,982/h", icon: ScanText, state: "active" },
  { name: "Chunk", count: 7, rate: "4,214/h", icon: Split, state: "active" },
  { name: "Embed", count: 31, rate: "3,842/h", icon: Layers3, state: "active" },
  { name: "Index", count: 4, rate: "4,006/h", icon: FileSearch, state: "active" },
];

const initialFailures = [
  { id: "ING-8461", document: "legacy-controls.pdf", stage: "Extract", reason: "OCR confidence below 0.72 threshold", attempts: 2, time: "08:12 UTC" },
  { id: "ING-8458", document: "customer-export-07.csv", stage: "Chunk", reason: "Unsupported delimiter consistency", attempts: 1, time: "07:54 UTC" },
  { id: "ING-8449", document: "contract-appendix.pdf", stage: "Embed", reason: "Provider rate limit exhausted", attempts: 3, time: "07:31 UTC" },
];

export function IngestionView() {
  const [failures, setFailures] = useState(initialFailures);
  const [notice, setNotice] = useState("");

  function retry(id: string) {
    const item = failures.find((failure) => failure.id === id);
    setFailures((current) => current.filter((failure) => failure.id !== id));
    setNotice(`${item?.document ?? "Document"} returned to the processing queue.`);
  }

  return (
    <div>
      <PageHeader eyebrow="Pipeline / Ingestion" title="Document processing" description="Trace document flow from receipt through durable vector indexing and recover failed work." actions={<DemoBadge label="Representative queue" />} />
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        {notice && <div role="status" className="flex items-center gap-2 border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-[#9af0ba]"><Check size={16} aria-hidden="true" />{notice}</div>}
        <section className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4" aria-label="Ingestion queue metrics">
          <MetricCard label="Queue depth" value="84" detail="Within operating range" icon={Layers3} status="positive" />
          <MetricCard label="Processing rate" value="3,842/h" detail="+6.1% over 24-hour mean" icon={RefreshCw} status="positive" />
          <MetricCard label="Oldest item" value="04:18" detail="Target under 10 minutes" icon={Clock3} />
          <MetricCard label="Failed / 24h" value="17" detail="0.07% of received documents" icon={AlertTriangle} status="warning" />
        </section>

        <SectionPanel title="Processing pipeline" eyebrow="Current stage occupancy" action={<StatusBadge state="operational" label="Workers online" />}>
          <ol className="grid gap-px bg-line md:grid-cols-5">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <li key={stage.name} className="relative bg-surface-1 p-4 sm:p-5">
                  <div className="flex items-center justify-between"><Icon size={19} className="text-accent" aria-hidden="true" /><span className="data-value text-xl font-semibold">{stage.count}</span></div>
                  <p className="mt-5 font-mono text-sm font-semibold">{String(index + 1).padStart(2, "0")} / {stage.name}</p>
                  <p className="mt-1 text-xs text-ink-faint">Sustained {stage.rate}</p>
                  {index < stages.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 bg-surface-1 text-line-strong md:block" size={22} aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </SectionPanel>

        <SectionPanel title="Failed documents" eyebrow="Requires intervention" action={<span className="font-mono text-xs text-danger">{failures.length} unresolved</span>}>
          {failures.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center p-5 text-center"><Check size={24} className="text-accent" aria-hidden="true" /><p className="mt-3 font-mono text-sm">Failure queue cleared</p><p className="mt-1 text-xs text-ink-muted">Retried documents are processing.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line bg-surface-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-5 py-3 font-medium">Job</th><th className="px-4 py-3 font-medium">Document</th><th className="px-4 py-3 font-medium">Stage</th><th className="px-4 py-3 font-medium">Failure</th><th className="px-4 py-3 font-medium">Attempts</th><th className="px-5 py-3 text-right font-medium">Action</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {failures.map((failure) => <tr key={failure.id} className="transition-colors hover:bg-surface-2"><td className="px-5 py-4 font-mono text-xs text-ink-muted">{failure.id}<span className="mt-1 block text-[10px] text-ink-faint">{failure.time}</span></td><td className="px-4 py-4 font-medium">{failure.document}</td><td className="px-4 py-4"><StatusBadge state="down" label={failure.stage} /></td><td className="max-w-sm px-4 py-4 text-xs text-ink-muted">{failure.reason}</td><td className="px-4 py-4 font-mono">{failure.attempts}/3</td><td className="px-5 py-4 text-right"><button className="btn-secondary" onClick={() => retry(failure.id)}><RefreshCw size={15} aria-hidden="true" /> Retry</button></td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </SectionPanel>
      </div>
    </div>
  );
}
