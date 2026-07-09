import type { ActivityItem, DashboardMetrics, RagDocument } from "@/lib/types";

export const demoMetrics: DashboardMetrics = {
  corpusCount: 12,
  documentCount: 248_392,
  chunkCount: 3_861_204,
  indexSizeGb: 184.7,
  queriesToday: 18_429,
  ingestionPerHour: 3_842,
  retrievalP50Ms: 84,
  retrievalP95Ms: 231,
  cacheHitRate: 72.4,
  throughput: [
    { time: "00:00", value: 2140 }, { time: "04:00", value: 1860 },
    { time: "08:00", value: 3240 }, { time: "12:00", value: 4180 },
    { time: "16:00", value: 3842 }, { time: "20:00", value: 2910 },
  ],
  latency: [
    { time: "00:00", value: 196 }, { time: "04:00", value: 184 },
    { time: "08:00", value: 211 }, { time: "12:00", value: 247 },
    { time: "16:00", value: 231 }, { time: "20:00", value: 204 },
  ],
};

export const demoDocuments: RagDocument[] = [
  { id: "doc-01", title: "Q2 Risk Committee Minutes", filename: "risk-committee-q2.pdf", document_type: "meeting_minutes", corpus_id: "enterprise-governance", status: "ready", chunk_count: 184, size_bytes: 2_481_920, source_date: "2026-06-28", created_at: "2026-07-10T08:42:00Z" },
  { id: "doc-02", title: "Platform Operations Handbook", filename: "platform-operations-v4.pdf", document_type: "handbook", corpus_id: "engineering", status: "ready", chunk_count: 428, size_bytes: 6_912_000, source_date: "2026-07-01", created_at: "2026-07-10T08:31:00Z" },
  { id: "doc-03", title: "Vendor Security Assessment", filename: "vendor-assessment.docx", document_type: "assessment", corpus_id: "enterprise-governance", status: "processing", chunk_count: 0, size_bytes: 1_284_000, created_at: "2026-07-10T08:29:00Z" },
  { id: "doc-04", title: "Customer Support Taxonomy", filename: "support-taxonomy.csv", document_type: "dataset", corpus_id: "customer-experience", status: "queued", size_bytes: 842_000, created_at: "2026-07-10T08:22:00Z" },
  { id: "doc-05", title: "Legacy Compliance Controls", filename: "legacy-controls.pdf", document_type: "policy", corpus_id: "enterprise-governance", status: "failed", size_bytes: 3_120_000, created_at: "2026-07-10T07:58:00Z", error: "OCR confidence below ingestion threshold." },
  { id: "doc-06", title: "Product Architecture Decision Log", filename: "architecture-decisions.md", document_type: "technical", corpus_id: "engineering", status: "ready", chunk_count: 96, size_bytes: 412_000, source_date: "2026-07-09", created_at: "2026-07-10T07:41:00Z" },
];

export const recentActivity: ActivityItem[] = [
  { id: "a1", kind: "ingestion", title: "Batch ING-8472 completed", detail: "2,184 documents indexed in 11m 42s", at: "2 min ago", state: "operational" },
  { id: "a2", kind: "query", title: "Query volume threshold", detail: "12% above weekday baseline", at: "9 min ago", state: "operational" },
  { id: "a3", kind: "evaluation", title: "Evaluation suite release-26.7", detail: "Passed 5 of 5 quality gates", at: "28 min ago", state: "operational" },
  { id: "a4", kind: "alert", title: "Tavily connector latency", detail: "P95 elevated for 6 minutes", at: "41 min ago", state: "degraded" },
];
