"use client";

import { BarChart3, Check, CircleGauge, Crosshair, Quote, ShieldCheck } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DemoBadge, MetricCard, PageHeader, SectionPanel, StatusBadge } from "@/components/ui";

const trend = [
  { release: "26.2", recall: 88.1, faithfulness: 92.4, relevancy: 89.3 },
  { release: "26.3", recall: 89.8, faithfulness: 93.1, relevancy: 90.4 },
  { release: "26.4", recall: 91.2, faithfulness: 92.8, relevancy: 91.6 },
  { release: "26.5", recall: 92.4, faithfulness: 94.2, relevancy: 92.1 },
  { release: "26.6", recall: 93.1, faithfulness: 95.1, relevancy: 93.5 },
  { release: "26.7", recall: 94.2, faithfulness: 96.1, relevancy: 94.0 },
];

const gates = [
  { name: "Recall@20", actual: "94.2%", threshold: ">= 92.0%", margin: "+2.2 pp" },
  { name: "Faithfulness", actual: "96.1%", threshold: ">= 95.0%", margin: "+1.1 pp" },
  { name: "Citation precision", actual: "97.3%", threshold: ">= 96.0%", margin: "+1.3 pp" },
  { name: "Answer relevancy", actual: "94.0%", threshold: ">= 92.0%", margin: "+2.0 pp" },
  { name: "P95 response latency", actual: "1.82 s", threshold: "<= 2.20 s", margin: "-0.38 s" },
];

const tooltipStyle = { background: "#0b1628", border: "1px solid #3b4d65", borderRadius: 0, color: "#f8fafc", fontFamily: "var(--font-fira-code)", fontSize: 12 };

export function EvaluationView() {
  return (
    <div>
      <PageHeader eyebrow="Quality / Evaluation" title="Grounding quality" description="Measure retrieval and generation quality against versioned suites before promoting a release." actions={<><DemoBadge label="Evaluation fixture" /><button className="btn-primary"><BarChart3 size={16} aria-hidden="true" /> Run evaluation</button></>} />
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4" aria-label="Evaluation metrics">
          <MetricCard label="Recall@20" value="94.2%" detail="+1.1 pp from release 26.6" icon={Crosshair} status="positive" />
          <MetricCard label="Faithfulness" value="96.1%" detail="1.1 pp above release gate" icon={ShieldCheck} status="positive" />
          <MetricCard label="Citation precision" value="97.3%" detail="12 false-positive citations" icon={Quote} status="positive" />
          <MetricCard label="Answer relevancy" value="94.0%" detail="+0.5 pp from release 26.6" icon={CircleGauge} status="positive" />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <SectionPanel title="Quality trend" eyebrow="Last six candidate releases">
            <div className="h-[340px] px-1 pb-4 pt-6" role="img" aria-label="Recall, faithfulness, and answer relevancy have improved across the last six releases.">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 15, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#26364c" vertical={false} />
                  <XAxis dataKey="release" stroke="#718096" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[80, 100]} stroke="#718096" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => `${value}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${Number(value).toFixed(1)}%`} />
                  <Legend iconType="plainline" wrapperStyle={{ fontFamily: "var(--font-fira-code)", fontSize: 11, color: "#a8b3c4" }} />
                  <Line type="monotone" dataKey="recall" name="Recall@20" stroke="#32d074" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="faithfulness" name="Faithfulness" stroke="#67b8ff" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="relevancy" name="Answer relevancy" stroke="#c4b5fd" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionPanel>

          <SectionPanel title="Candidate release" eyebrow="release-26.7" action={<StatusBadge state="operational" label="All gates pass" />}>
            <div className="border-b border-line bg-accent/5 p-5">
              <div className="flex items-center gap-3"><span className="grid size-11 place-items-center border border-accent/40 bg-accent/10 text-accent"><Check size={20} aria-hidden="true" /></span><div><p className="font-mono text-sm font-semibold">Ready for promotion</p><p className="mt-1 text-xs text-ink-muted">1,240 cases / completed 08:14 UTC</p></div></div>
            </div>
            <dl className="divide-y divide-line">
              <div className="flex justify-between gap-4 px-5 py-4"><dt className="text-xs text-ink-muted">Dataset</dt><dd className="font-mono text-xs text-ink">enterprise-golden-v18</dd></div>
              <div className="flex justify-between gap-4 px-5 py-4"><dt className="text-xs text-ink-muted">Prompt bundle</dt><dd className="font-mono text-xs text-ink">grounded-v34</dd></div>
              <div className="flex justify-between gap-4 px-5 py-4"><dt className="text-xs text-ink-muted">Regressions</dt><dd className="font-mono text-xs text-ink">0 critical / 3 minor</dd></div>
              <div className="flex justify-between gap-4 px-5 py-4"><dt className="text-xs text-ink-muted">Evaluator agreement</dt><dd className="font-mono text-xs text-ink">98.4%</dd></div>
            </dl>
          </SectionPanel>
        </div>

        <SectionPanel title="Release gates" eyebrow="Promotion policy / production">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-5 py-3 font-medium">Metric</th><th className="px-4 py-3 font-medium">Candidate</th><th className="px-4 py-3 font-medium">Gate</th><th className="px-4 py-3 font-medium">Margin</th><th className="px-5 py-3 text-right font-medium">Result</th></tr></thead>
              <tbody className="divide-y divide-line">{gates.map((gate) => <tr key={gate.name}><td className="px-5 py-4 font-medium">{gate.name}</td><td className="data-value px-4 py-4">{gate.actual}</td><td className="px-4 py-4 font-mono text-xs text-ink-muted">{gate.threshold}</td><td className="px-4 py-4 font-mono text-xs text-accent">{gate.margin}</td><td className="px-5 py-4 text-right"><StatusBadge state="operational" label="Pass" /></td></tr>)}</tbody>
            </table>
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}
