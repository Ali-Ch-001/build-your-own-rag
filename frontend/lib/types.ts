export type ServiceState = "operational" | "degraded" | "down" | "unknown";

export interface HealthResponse {
  status?: string;
  version?: string;
  checks?: Record<string, string | boolean>;
}

export interface MetricPoint {
  time: string;
  value: number;
}

export interface DashboardMetrics {
  corpusCount: number;
  documentCount: number;
  chunkCount: number;
  indexSizeGb: number;
  queriesToday: number;
  ingestionPerHour: number;
  retrievalP50Ms: number;
  retrievalP95Ms: number;
  cacheHitRate: number;
  throughput: MetricPoint[];
  latency: MetricPoint[];
}

export interface DashboardData {
  live: ServiceState;
  ready: ServiceState;
  metrics: DashboardMetrics;
  demo: boolean;
  fetchedAt: string;
}

export type DocumentState = "ready" | "processing" | "queued" | "failed";

export interface RagDocument {
  id: string;
  title: string;
  filename: string;
  document_type: string;
  corpus_id: string;
  status: DocumentState;
  chunk_count?: number;
  size_bytes?: number;
  source_date?: string;
  created_at: string;
  error?: string;
}

export interface DocumentsResult {
  documents: RagDocument[];
  demo: boolean;
}

export interface Citation {
  id: string;
  documentId?: string;
  title: string;
  page?: number;
  section?: string;
  quote?: string;
  score?: number;
  uri?: string;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
}

export type ResponseEventType =
  | "status"
  | "tool"
  | "source"
  | "token"
  | "citation"
  | "usage"
  | "error"
  | "done";

export interface ResponseEvent<T = unknown> {
  seq: number;
  type: ResponseEventType | string;
  response_id: string;
  data: T;
}

export interface StreamRequest {
  message: string;
  corpus_ids: string[];
  response_mode: "grounded";
  disconnect_behavior: "cancel";
}

export interface IngestionSummary {
  source: string;
  active_documents: number;
  document_states: Record<string, number>;
  queue_depth: Record<string, number>;
  retry_queue: Record<string, number>;
  today_processed: number;
  failed_24h: number;
  recent_failures: IngestionFailure[];
  pipeline_stages: PipelineStage[];
  generated_at: string;
}

export interface IngestionFailure {
  job_id: string;
  stage: string;
  reason: string;
  at: string | null;
}

export interface PipelineStage {
  name: string;
  count: number;
  completed: number;
  failed: number;
}

export interface DependencyStatus {
  name: string;
  role: string;
  latency: string;
  state: ServiceState;
}

export interface SloBudget {
  label: string;
  current: string;
  target: string;
  used: number;
}

export interface OperationsData {
  ingestion: IngestionSummary | null;
  dependencies: DependencyStatus[];
  sloBudgets: SloBudget[];
  demo: boolean;
  fetchedAt: string;
}

export interface ActivityItem {
  id: string;
  kind: "ingestion" | "query" | "evaluation" | "alert";
  title: string;
  detail: string;
  at: string;
  state: ServiceState;
}

export interface EvaluationGate {
  name: string;
  actual: string;
  threshold: string;
  margin: string;
}

export interface TrendPoint {
  release: string;
  recall: number;
}

export interface EvaluationSummary {
  run_id: string;
  dataset_name: string;
  corpus_id: string;
  case_count: number;
  status: string;
  recall_at_20: number;
  faithfulness: number;
  citation_precision: number;
  answer_relevancy: number;
  answer_correctness: number;
  p95_latency_s: number;
  created_at: string;
  completed_at: string | null;
  trends: TrendPoint[];
  release_gates: EvaluationGate[];
}
