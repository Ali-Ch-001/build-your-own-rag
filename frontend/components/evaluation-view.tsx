"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check, CircleGauge, Crosshair, Quote, ShieldCheck, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DemoBadge, MetricCard, PageHeader, SectionPanel, StatusBadge } from "@/components/ui";
import type { EvaluationSummary, TrendPoint } from "@/lib/types";
import { getEvaluationResults, runEvaluation } from "@/lib/evaluation-api";

const tooltipStyle = { background: "#0b1628", border: "1px solid #3b4d65", borderRadius: 0, color: "#f8fafc", fontFamily: "var(--font-fira-code)", fontSize: 12 };

const demoTrend: TrendPoint[] = [
  { release: "26.2", recall: 88.1 },
  { release: "26.3", recall: 89.8 },
  { release: "26.4", recall: 91.2 },
  { release: "26.5", recall: 92.4 },
  { release: "26.6", recall: 93.1 },
  { release: "26.7", recall: 94.2 },
];

const demoGates = [
  { name: "Recall@20", actual: "94.2%", threshold: ">= 92.0%", margin: "+2.2 pp" },
  { name: "Faithfulness", actual: "96.1%", threshold: ">= 95.0%", margin: "+1.1 pp" },
  { name: "Citation precision", actual: "97.3%", threshold: ">= 96.0%", margin: "+1.3 pp" },
  { name: "Answer relevancy", actual: "94.0%", threshold: ">= 92.0%", margin: "+2.0 pp" },
  { name: "P95 response latency", actual: "1.82 s", threshold: "<= 2.20 s", margin: "-0.38 s" },
];

export function EvaluationView() {
  const [data, setData] = useState<EvaluationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEvaluationResults()
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleRun = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const result = await runEvaluation();
      setData(result);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Evaluation run failed");
    } finally {
      setRunning(false);
    }
  };

  const hasLive = data !== null;
  const recallPct = hasLive ? (data.recall_at_20 * 100) : 94.2;
  const faithPct = hasLive ? (data.faithfulness * 100) : 96.1;
  const citPct = hasLive ? (data.citation_precision * 100) : 97.3;
  const relPct = hasLive ? (data.answer_relevancy * 100) : 94.0;

  const gates = hasLive && data.release_gates.length > 0 ? data.release_gates : demoGates;
  const trends = hasLive && data.trends.length > 0 ? data.trends : demoTrend;

  const gatePassed = gates.every((g) => {
    if (g.name === "P95 response latency") {
      const actual = parseFloat(g.actual);
      return actual <= 2.20;
    }
    return !g.margin.startsWith("-");
  });

  return (
    <div>
      <PageHeader
        eyebrow="Quality / Evaluation"
        title="Grounding quality"
        description="Measure retrieval and generation quality against versioned suites before promoting a release."
        actions={
          <>
            {!hasLive && <DemoBadge label="Evaluation fixture" />}
            <button
              className="btn-primary"
              onClick={handleRun}
              disabled={running}
            >
              <BarChart3 size={16} aria-hidden="true" />
              {running ? "Running..." : "Run evaluation"}
            </button>
            {runError && (
              <span className="text-danger text-xs font-mono ml-2">{runError}</span>
            )}
          </>
        }
      />

      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading metrics">
            {[0, 1, 2, 3].map((i) => (
              <div className="bg-surface-1 p-5 animate-pulse" key={i}>
                <div className="h-3 w-24 bg-line rounded" />
                <div className="h-8 w-32 bg-line rounded mt-6" />
                <div className="h-3 w-40 bg-line rounded mt-3" />
              </div>
            ))}
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4" aria-label="Evaluation metrics">
            <MetricCard label="Recall@20" value={`${recallPct.toFixed(1)}%`} detail={hasLive ? `From ${data.case_count} evaluation cases` : "+1.1 pp from release 26.6"} icon={Crosshair} status={recallPct >= 85 ? "positive" : "warning"} />
            <MetricCard label="Faithfulness" value={`${faithPct.toFixed(1)}%`} detail={hasLive ? (faithPct >= 90 ? `${(faithPct - 90).toFixed(1)} pp above gate` : `${(90 - faithPct).toFixed(1)} pp below gate`) : "1.1 pp above release gate"} icon={ShieldCheck} status={faithPct >= 90 ? "positive" : "warning"} />
            <MetricCard label="Citation precision" value={`${citPct.toFixed(1)}%`} detail={hasLive ? `Token overlap on ${data.case_count} cases` : "12 false-positive citations"} icon={Quote} status={citPct >= 90 ? "positive" : citPct >= 80 ? "warning" : "neutral"} />
            <MetricCard label="Answer relevancy" value={`${relPct.toFixed(1)}%`} detail={hasLive ? (relPct >= 85 ? `${(relPct - 85).toFixed(1)} pp above gate` : `${(85 - relPct).toFixed(1)} pp below gate`) : "+0.5 pp from release 26.6"} icon={CircleGauge} status={relPct >= 85 ? "positive" : "warning"} />
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <SectionPanel title="Quality trend" eyebrow={hasLive ? `Dataset: ${data.dataset_name}` : "Last six candidate releases"}>
            <div className="h-[340px] px-1 pb-4 pt-6" role="img" aria-label="Recall, faithfulness, and answer relevancy have improved across the last six releases.">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends} margin={{ top: 8, right: 15, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#26364c" vertical={false} />
                  <XAxis dataKey="release" stroke="#718096" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#718096" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value: number) => `${value}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${Number(value).toFixed(1)}%`} />
                  <Legend iconType="plainline" wrapperStyle={{ fontFamily: "var(--font-fira-code)", fontSize: 11, color: "#a8b3c4" }} />
                  <Line type="monotone" dataKey="recall" name="Recall@20" stroke="#32d074" strokeWidth={2} dot={{ r: 2 }} />
                  {hasLive && data.trends.some(t => "faithfulness" in t) && (
                    <Line type="monotone" dataKey="faithfulness" name="Faithfulness" stroke="#67b8ff" strokeWidth={2} dot={{ r: 2 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionPanel>

          <SectionPanel
            title={hasLive ? "Current run" : "Candidate release"}
            eyebrow={hasLive ? data.run_id.slice(0, 8) : "release-26.7"}
            action={<StatusBadge state={gatePassed ? "operational" : "degraded"} label={gatePassed ? "All gates pass" : "Gates failing"} />}
          >
            <div className="border-b border-line bg-accent/5 p-5">
              <div className="flex items-center gap-3">
                <span className={`grid size-11 place-items-center border ${gatePassed ? "border-accent/40 bg-accent/10 text-accent" : "border-danger/40 bg-danger/10 text-danger"}`}>
                  {gatePassed ? <Check size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
                </span>
                <div>
                  <p className="font-mono text-sm font-semibold">{gatePassed ? "Ready for promotion" : "Gates not met"}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {hasLive ? `${data.case_count} cases / completed ${data.completed_at ? new Date(data.completed_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : ""}` : "1,240 cases / completed 08:14 UTC"}
                  </p>
                </div>
              </div>
            </div>
            <dl className="divide-y divide-line">
              <div className="flex justify-between gap-4 px-5 py-4"><dt className="text-xs text-ink-muted">Dataset</dt><dd className="font-mono text-xs text-ink">{hasLive ? data.dataset_name : "enterprise-golden-v18"}</dd></div>
              <div className="flex justify-between gap-4 px-5 py-4"><dt className="text-xs text-ink-muted">Recall@20</dt><dd className="font-mono text-xs text-ink">{recallPct.toFixed(1)}%</dd></div>
              <div className="flex justify-between gap-4 px-5 py-4"><dt className="text-xs text-ink-muted">P95 Latency</dt><dd className="font-mono text-xs text-ink">{hasLive ? `${data.p95_latency_s.toFixed(2)} s` : "1.82 s"}</dd></div>
              <div className="flex justify-between gap-4 px-5 py-4"><dt className="text-xs text-ink-muted">Correctness</dt><dd className="font-mono text-xs text-ink">{hasLive ? `${(data.answer_correctness * 100).toFixed(1)}%` : "98.4%"}</dd></div>
            </dl>
          </SectionPanel>
        </div>

        <SectionPanel title="Release gates" eyebrow="Promotion policy / production">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                <tr>
                  <th className="px-5 py-3 font-medium">Metric</th>
                  <th className="px-4 py-3 font-medium">Candidate</th>
                  <th className="px-4 py-3 font-medium">Gate</th>
                  <th className="px-4 py-3 font-medium">Margin</th>
                  <th className="px-5 py-3 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {gates.map((gate) => {
                  const passed = !gate.margin.startsWith("-");
                  return (
                    <tr key={gate.name}>
                      <td className="px-5 py-4 font-medium">{gate.name}</td>
                      <td className="data-value px-4 py-4">{gate.actual}</td>
                      <td className="px-4 py-4 font-mono text-xs text-ink-muted">{gate.threshold}</td>
                      <td className={`px-4 py-4 font-mono text-xs ${passed ? "text-accent" : "text-danger"}`}>{gate.margin}</td>
                      <td className="px-5 py-4 text-right">
                        <StatusBadge state={passed ? "operational" : "degraded"} label={passed ? "Pass" : "Fail"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}
