"use client";

import { useEffect, useState } from "react";
import { Activity, Boxes, Database, FileStack, Gauge, HardDrive, RefreshCw, Search, ServerCog, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboardData } from "@/lib/api";
import { recentActivity } from "@/lib/demo-data";
import { formatNumber } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { DemoBadge, LoadingGrid, MetricCard, PageHeader, SectionPanel, StatusBadge } from "@/components/ui";

const chartTooltipStyle = { background: "#0b1628", border: "1px solid #3b4d65", borderRadius: 0, color: "#f8fafc", fontFamily: "var(--font-fira-code)", fontSize: 12 };

export function Overview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let current = true;
    void getDashboardData().then((result) => { if (current) setData(result); });
    return () => { current = false; };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try { setData(await getDashboardData()); }
    finally { setRefreshing(false); }
  }

  const metrics = data?.metrics;

  return (
    <div>
      <PageHeader
        eyebrow="Control plane / Overview"
        title="Retrieval operations"
        description="A live operating picture of corpus health, indexing throughput, and grounded-response performance."
        actions={
          <>
            {data?.demo && <DemoBadge />}
            <button type="button" className="btn-secondary" onClick={refresh} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden="true" /> {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </>
        }
      />

      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <section aria-labelledby="system-status" className="panel flex flex-col justify-between gap-5 border-l-2 border-l-accent p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center border border-accent/40 bg-accent/10 text-accent"><ServerCog size={21} aria-hidden="true" /></span>
            <div>
              <h2 id="system-status" className="font-mono text-sm font-semibold text-ink">System status</h2>
              <p className="mt-1 text-sm text-ink-muted">Core response and indexing paths are monitored independently.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge state={data?.live ?? "unknown"} label="API live" />
            <StatusBadge state={data?.ready ?? "unknown"} label="Dependencies ready" />
          </div>
        </section>

        {!metrics ? <LoadingGrid /> : (
          <section aria-label="Corpus metrics" className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Documents indexed" value={formatNumber(metrics.documentCount)} detail={`${metrics.corpusCount} active corpora`} icon={FileStack} status="positive" />
            <MetricCard label="Retrievable chunks" value={formatNumber(metrics.chunkCount)} detail={`${metrics.indexSizeGb.toFixed(1)} GB vector index`} icon={Boxes} />
            <MetricCard label="Queries today" value={formatNumber(metrics.queriesToday)} detail="+8.4% from weekday baseline" icon={Search} status="positive" />
            <MetricCard label="Retrieval P95" value={`${metrics.retrievalP95Ms} ms`} detail={`P50 ${metrics.retrievalP50Ms} ms / SLO < 300 ms`} icon={Gauge} status="positive" />
          </section>
        )}

        {metrics && (
          <div className="grid min-w-0 gap-6 xl:grid-cols-[1.35fr_1fr]">
            <SectionPanel title="Ingestion throughput" eyebrow="Documents / hour" action={<span className="data-value text-sm text-accent">{formatNumber(metrics.ingestionPerHour)}/h</span>}>
              <div className="h-72 px-1 pb-3 pt-5" role="img" aria-label="Ingestion throughput over the past 24 hours, currently 3,842 documents per hour.">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.throughput} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#26364c" vertical={false} />
                    <XAxis dataKey="time" stroke="#718096" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis stroke="#718096" tickLine={false} axisLine={false} fontSize={11} width={50} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "#111f33" }} formatter={(value) => [`${Number(value).toLocaleString()} docs`, "Throughput"]} />
                    <Bar dataKey="value" fill="#32d074" radius={0} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionPanel>

            <SectionPanel title="Retrieval latency" eyebrow="P95 milliseconds" action={<span className="data-value text-sm text-ink">{metrics.retrievalP95Ms} ms</span>}>
              <div className="h-72 px-1 pb-3 pt-5" role="img" aria-label="Retrieval P95 latency over the past 24 hours, currently 231 milliseconds.">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.latency} margin={{ top: 8, right: 14, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#26364c" vertical={false} />
                    <XAxis dataKey="time" stroke="#718096" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis stroke="#718096" tickLine={false} axisLine={false} fontSize={11} domain={[0, 300]} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [`${value} ms`, "P95"]} />
                    <Line type="monotone" dataKey="value" stroke="#67b8ff" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#67b8ff" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionPanel>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <SectionPanel title="Architecture health" eyebrow="Critical path">
            <div className="grid gap-px bg-line sm:grid-cols-2">
              {[
                ["Response API", "Healthy", "14 instances", Activity],
                ["Vector index", "Healthy", "12 / 12 shards", Database],
                ["Object storage", "Healthy", "99.99% available", HardDrive],
                ["Worker fleet", "Healthy", "38 / 40 active", Zap],
              ].map(([name, status, detail, Icon]) => {
                const HealthIcon = Icon as typeof Activity;
                return (
                  <div key={String(name)} className="flex items-center gap-3 bg-surface-1 p-4">
                    <HealthIcon size={18} className="text-ink-faint" aria-hidden="true" />
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{String(name)}</p><p className="mt-0.5 font-mono text-xs text-ink-faint">{String(detail)}</p></div>
                    <StatusBadge state="operational" label={String(status)} />
                  </div>
                );
              })}
            </div>
          </SectionPanel>

          <SectionPanel title="Recent activity" eyebrow="Last 60 minutes">
            <ol className="divide-y divide-line">
              {recentActivity.map((item) => (
                <li key={item.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
                  <span className={`mt-1.5 size-2 shrink-0 ${item.state === "operational" ? "bg-accent" : "bg-warning"}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{item.title}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{item.detail}</p></div>
                  <time className="shrink-0 font-mono text-[10px] text-ink-faint">{item.at}</time>
                </li>
              ))}
            </ol>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}
