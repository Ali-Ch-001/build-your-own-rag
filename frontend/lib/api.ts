import { demoDocuments, demoMetrics } from "@/lib/demo-data";
import { parseResponseEnvelope, SseParser } from "@/lib/sse";
import type {
  DashboardData,
  DependencyStatus,
  DocumentsResult,
  HealthResponse,
  IngestionSummary,
  OperationsData,
  RagDocument,
  ResponseEvent,
  SloBudget,
  StreamRequest,
} from "@/lib/types";
import { authorizationHeaders } from "@/lib/auth-token";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await authorizationHeaders();
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: { ...authHeaders, ...init?.headers },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function stateFromHealth(result: PromiseSettledResult<HealthResponse>): DashboardData["live"] {
  if (result.status === "rejected") return "down";
  const status = result.value.status?.toLowerCase();
  if (status === "ok" || status === "healthy" || status === "ready" || status === "live") return "operational";
  if (status === "degraded") return "degraded";
  return "unknown";
}

export async function getDashboardData(): Promise<DashboardData> {
  const [live, ready, metrics] = await Promise.allSettled([
    apiFetch<HealthResponse>("/health/live"),
    apiFetch<HealthResponse>("/health/ready"),
    apiFetch<Partial<typeof demoMetrics>>("/metrics/summary"),
  ]);
  const hasLiveMetrics = metrics.status === "fulfilled";
  const liveMetrics = metrics.status === "fulfilled" ? metrics.value as Record<string, unknown> : {};
  const normalizedMetrics = {
    ...demoMetrics,
    corpusCount: typeof liveMetrics.corpus_count === "number" ? liveMetrics.corpus_count : 0,
    documentCount: typeof liveMetrics.documents === "number" ? liveMetrics.documents : demoMetrics.documentCount,
    chunkCount: typeof liveMetrics.chunks === "number" ? liveMetrics.chunks : demoMetrics.chunkCount,
    indexSizeGb: typeof liveMetrics.index_size_gb === "number" ? liveMetrics.index_size_gb : 0,
    queriesToday: typeof liveMetrics.queries_today === "number" ? liveMetrics.queries_today : 0,
    ingestionPerHour: typeof liveMetrics.ingestion_per_hour === "number" ? liveMetrics.ingestion_per_hour : 0,
    retrievalP50Ms: typeof liveMetrics.retrieval_p50_ms === "number" ? liveMetrics.retrieval_p50_ms : 0,
    retrievalP95Ms: typeof liveMetrics.retrieval_p95_ms === "number" ? liveMetrics.retrieval_p95_ms : demoMetrics.retrievalP95Ms,
    cacheHitRate: typeof liveMetrics.cache_hit_rate === "number" ? liveMetrics.cache_hit_rate : demoMetrics.cacheHitRate,
    throughput: Array.isArray(liveMetrics.throughput) ? liveMetrics.throughput as typeof demoMetrics.throughput : [],
    latency: Array.isArray(liveMetrics.latency) ? liveMetrics.latency as typeof demoMetrics.latency : [],
  };
  return {
    live: stateFromHealth(live),
    ready: stateFromHealth(ready),
    metrics: hasLiveMetrics ? normalizedMetrics : demoMetrics,
    demo: !hasLiveMetrics || live.status === "rejected" || ready.status === "rejected",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getDocuments(): Promise<DocumentsResult> {
  try {
    const payload = await apiFetch<unknown[] | { items?: unknown[]; documents?: unknown[] }>("/v1/documents");
    const rows = Array.isArray(payload) ? payload : payload.documents ?? payload.items ?? [];
    const documents = rows.map(normalizeDocument);
    return { documents, demo: false };
  } catch {
    return { documents: demoDocuments, demo: true };
  }
}

interface UploadFields {
  file: File;
  corpusId: string;
  title: string;
  documentType: string;
  sourceDate?: string;
}

export function uploadDocument(fields: UploadFields, onProgress: (progress: number) => void): { promise: Promise<RagDocument>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const form = new FormData();
  form.append("file", fields.file);
  form.append("corpus_id", fields.corpusId);
  form.append("title", fields.title);
  form.append("document_type", fields.documentType);
  if (fields.sourceDate) form.append("source_date", fields.sourceDate);

  const promise = new Promise<RagDocument>((resolve, reject) => {
    void (async () => {
      const authHeaders = await authorizationHeaders();
      xhr.open("POST", `${apiUrl}/v1/documents`);
      xhr.withCredentials = true;
      Object.entries(authHeaders).forEach(([key, value]) => xhr.setRequestHeader(key, String(value)));
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(normalizeDocument(JSON.parse(xhr.responseText) as unknown)); }
          catch { reject(new Error("Upload completed, but the response was invalid.")); }
        } else reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`));
      });
      xhr.addEventListener("error", () => reject(new Error("Upload failed. Check the API connection and retry.")));
      xhr.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")));
      xhr.send(form);
    })().catch(reject);
  });

  return { promise, abort: () => xhr.abort() };
}

export async function streamResponse(request: StreamRequest, signal: AbortSignal, onEvent: (event: ResponseEvent) => void): Promise<void> {
  const authHeaders = await authorizationHeaders();
  const response = await fetch(`${apiUrl}/v1/responses`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error((await response.text().catch(() => "")) || `Response request failed with status ${response.status}`);
  if (!response.body) throw new Error("Streaming is unavailable in this browser.");

  const parser = new SseParser((raw) => onEvent(parseResponseEnvelope(raw)));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
    completed = true;
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function cancelResponse(responseId: string): Promise<void> {
  await apiFetch<void>(`/v1/responses/${encodeURIComponent(responseId)}`, { method: "DELETE" });
}

export const defaultCorpusId = process.env.NEXT_PUBLIC_DEFAULT_CORPUS_ID ?? "";

export async function getOperationsData(): Promise<OperationsData> {
  try {
    const [ingestionRaw, healthRaw, metricsRaw] = await Promise.allSettled([
      apiFetch<IngestionSummary>("/v1/ingestion/summary"),
      apiFetch<HealthResponse>("/health/ready"),
      apiFetch<Record<string, unknown>>("/metrics/summary"),
    ]);

    const ingestion: IngestionSummary | null =
      ingestionRaw.status === "fulfilled" ? ingestionRaw.value : null;

    const health = healthRaw.status === "fulfilled" ? healthRaw.value : null;
    const checks = health?.checks ?? {};
    const dependencies: DependencyStatus[] = [
      { name: "PostgreSQL", role: "Metadata and tenant state", latency: typeof checks.postgres === "boolean" ? (checks.postgres ? "healthy" : "down") : "unknown", state: checks.postgres ? "operational" : "down" },
      { name: "Redis", role: "Caching and semantic search", latency: typeof checks.redis === "boolean" ? (checks.redis ? "healthy" : "down") : "unknown", state: checks.redis ? "operational" : "down" },
      { name: "Qdrant", role: "Dense vector retrieval", latency: typeof checks.qdrant === "boolean" ? (checks.qdrant ? "healthy" : "down") : "unknown", state: checks.qdrant ? "operational" : "unknown" },
      { name: "MinIO/S3", role: "Document and artifact storage", latency: typeof checks.minio === "boolean" ? (checks.minio ? "healthy" : "down") : "unknown", state: checks.minio ? "operational" : "unknown" },
      { name: "Kafka", role: "Event transport", latency: typeof checks.kafka === "boolean" ? (checks.kafka ? "healthy" : "down") : "unknown", state: checks.kafka ? "operational" : "unknown" },
    ];

    const metrics = metricsRaw.status === "fulfilled" ? metricsRaw.value : {};
    const p95 = typeof metrics.retrieval_p95_ms === "number" ? metrics.retrieval_p95_ms : 0;
    const p50 = typeof metrics.retrieval_p50_ms === "number" ? metrics.retrieval_p50_ms : 0;
    const cache = typeof metrics.cache_hit_rate === "number" ? metrics.cache_hit_rate : 0;

    const sloBudgets: SloBudget[] = [
      { label: "Response latency P95", current: `${p95.toFixed(0)} ms`, target: "350 ms", used: p95 > 0 ? Math.min(Math.round((p95 / 350) * 100), 100) : 0 },
      { label: "Cache hit rate", current: `${(cache * 100).toFixed(1)}%`, target: "60%", used: cache > 0 ? Math.min(Math.round(((1 - cache) / 0.4) * 100), 100) : 0 },
      { label: "P50 retrieval", current: `${p50.toFixed(0)} ms`, target: "200 ms", used: p50 > 0 ? Math.min(Math.round((p50 / 200) * 100), 100) : 0 },
    ];

    return { ingestion, dependencies, sloBudgets, demo: false, fetchedAt: new Date().toISOString() };
  } catch {
    return {
      ingestion: null,
      dependencies: [
        { name: "PostgreSQL", role: "Metadata and tenant state", latency: "unknown", state: "unknown" },
        { name: "Redis", role: "Caching and semantic search", latency: "unknown", state: "unknown" },
        { name: "Qdrant", role: "Dense vector retrieval", latency: "unknown", state: "unknown" },
        { name: "MinIO/S3", role: "Document and artifact storage", latency: "unknown", state: "unknown" },
        { name: "Kafka", role: "Event transport", latency: "unknown", state: "unknown" },
      ],
      sloBudgets: [
        { label: "Response latency P95", current: "N/A", target: "350 ms", used: 0 },
        { label: "Cache hit rate", current: "N/A", target: "60%", used: 0 },
        { label: "P50 retrieval", current: "N/A", target: "200 ms", used: 0 },
      ],
      demo: true,
      fetchedAt: new Date().toISOString(),
    };
  }
}

function normalizeDocument(value: unknown): RagDocument {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawState = String(row.state ?? row.status ?? "queued").toUpperCase();
  const status: RagDocument["status"] = rawState === "ACTIVE" || rawState === "READY"
    ? "ready"
    : rawState === "FAILED"
      ? "failed"
      : rawState === "PROCESSING"
        ? "processing"
        : "queued";
  const title = String(row.title ?? row.filename ?? "Untitled document");
  return {
    id: String(row.document_id ?? row.id ?? ""),
    title,
    filename: String(row.filename ?? `${title}.pdf`),
    document_type: String(row.document_type ?? "document"),
    corpus_id: String(row.corpus_id ?? ""),
    status,
    chunk_count: typeof row.chunk_count === "number" ? row.chunk_count : undefined,
    size_bytes: typeof row.size_bytes === "number" ? row.size_bytes : undefined,
    source_date: typeof row.source_date === "string" ? row.source_date : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    error: typeof row.error_detail === "string" ? row.error_detail : undefined,
  };
}
