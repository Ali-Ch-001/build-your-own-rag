import { demoDocuments, demoMetrics } from "@/lib/demo-data";
import { parseResponseEnvelope, SseParser } from "@/lib/sse";
import type { DashboardData, DocumentsResult, HealthResponse, RagDocument, ResponseEvent, StreamRequest } from "@/lib/types";
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
