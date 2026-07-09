"use client";

import { useRef, useState } from "react";
import { AlertCircle, Bot, Check, ChevronRight, ExternalLink, FileText, LoaderCircle, MessageSquareText, PanelRight, RefreshCw, Search, UserRound, Wrench, X } from "lucide-react";
import { cancelResponse, defaultCorpusId, streamResponse } from "@/lib/api";
import type { Citation, ResponseEvent, Usage } from "@/lib/types";
import { ChatComposer } from "@/components/chat-composer";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";

type ChatPhase = "idle" | "connecting" | "streaming" | "done" | "error" | "cancelled";

interface ToolEvent { id: string; label: string; detail?: string; }

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const data = value as Record<string, unknown>;
  for (const key of ["token", "delta", "text", "message", "detail", "stage", "status", "name", "tool_name"]) {
    if (typeof data[key] === "string") return data[key];
  }
  return "";
}

function citationValue(value: unknown, fallbackId: string): Citation {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: String(data.id ?? data.citation_id ?? fallbackId),
    documentId: typeof data.document_id === "string" ? data.document_id : undefined,
    title: String(data.title ?? data.document_title ?? data.filename ?? "Retrieved source"),
    page: typeof data.page === "number" ? data.page : typeof data.page_number === "number" ? data.page_number : typeof data.locator === "string" ? Number(data.locator.match(/\d+/)?.[0]) || undefined : undefined,
    section: typeof data.section === "string" ? data.section : undefined,
    quote: typeof data.quote === "string" ? data.quote : typeof data.snippet === "string" ? data.snippet : undefined,
    score: typeof data.score === "number" ? data.score : undefined,
    uri: typeof data.uri === "string" ? data.uri : undefined,
  };
}

function usageValue(value: unknown): Usage {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (...keys: string[]) => {
    const found = keys.map((key) => data[key]).find((item) => typeof item === "number");
    return typeof found === "number" ? found : undefined;
  };
  return { inputTokens: number("input_tokens", "inputTokens"), outputTokens: number("output_tokens", "outputTokens"), totalTokens: number("total_tokens", "totalTokens"), latencyMs: number("latency_ms", "latencyMs") };
}

const suggestions = [
  "Summarize the latest platform risk decisions.",
  "Which controls cover third-party model providers?",
  "Compare the current retrieval SLO with the prior release.",
];

export function ChatWorkspace() {
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [usage, setUsage] = useState<Usage>({});
  const [showSources, setShowSources] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const responseIdRef = useRef("");

  function handleEvent(event: ResponseEvent) {
    responseIdRef.current = event.response_id;
    if (event.type === "status") {
      setStatus(stringValue(event.data) || "Working");
      setPhase("streaming");
    }
    if (event.type === "tool" || event.type === "tool.started" || event.type === "tool.completed") {
      const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
      setTools((current) => [...current, { id: `${event.seq}`, label: stringValue(event.data) || "Retrieval tool", detail: typeof data.detail === "string" ? data.detail : undefined }]);
    }
    if (event.type === "source" || event.type === "citation") {
      const citation = citationValue(event.data, `source-${event.seq}`);
      setCitations((current) => current.some((item) => item.id === citation.id) ? current : [...current, citation]);
    }
    if (event.type === "token") {
      setPhase("streaming");
      setAnswer((current) => current + stringValue(event.data));
    }
    if (event.type === "usage") setUsage(usageValue(event.data));
    if (event.type === "error") throw new Error(stringValue(event.data) || "The response stream reported an error.");
    if (event.type === "done" || event.type === "response.completed") setPhase("done");
  }

  async function run(message: string) {
    if (!message.trim() || !defaultCorpusId) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    responseIdRef.current = "";
    setQuestion(message.trim());
    setQuery("");
    setAnswer("");
    setCitations([]);
    setTools([]);
    setUsage({});
    setError("");
    setStatus("Opening grounded response stream");
    setPhase("connecting");
    try {
      await streamResponse({ message: message.trim(), corpus_ids: [defaultCorpusId], response_mode: "grounded", disconnect_behavior: "cancel" }, controller.signal, handleEvent);
      setPhase((current) => current === "cancelled" ? current : "done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Unable to complete the grounded response.");
      setPhase("error");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  async function cancel() {
    const responseId = responseIdRef.current;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPhase("cancelled");
    setStatus("Response cancelled");
    if (responseId) await cancelResponse(responseId).catch(() => undefined);
  }

  const isStreaming = phase === "connecting" || phase === "streaming";
  const hasConversation = Boolean(question);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col lg:min-h-dvh">
      <PageHeader
        eyebrow="Workspace / Grounded chat"
        title="Ask the corpus"
        description="Stream evidence-backed answers with source-level provenance and token accounting."
        actions={<div className="flex items-center gap-2"><label htmlFor="corpus" className="sr-only">Corpus</label><select id="corpus" className="field max-w-[260px] font-mono text-xs" value={defaultCorpusId} disabled><option value={defaultCorpusId}>{defaultCorpusId ? `Default / ${defaultCorpusId.slice(0, 8)}...` : "Corpus not configured"}</option></select></div>}
      />

      <div className="mx-auto grid w-full max-w-[1500px] flex-1 gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:p-6">
        <section className="panel flex min-h-[640px] min-w-0 flex-col" aria-label="Grounded chat conversation">
          <div className="flex min-h-12 items-center justify-between border-b border-line px-4">
            <div className="flex items-center gap-2 text-xs text-ink-muted"><span className={`size-2 ${isStreaming ? "animate-pulse bg-info" : phase === "error" ? "bg-danger" : "bg-accent"}`} aria-hidden="true" /><span>{isStreaming ? status : phase === "error" ? "Response failed" : "Grounded response mode"}</span></div>
            <button className="btn-quiet px-2 lg:hidden" onClick={() => setShowSources((current) => !current)} aria-expanded={showSources}><PanelRight size={16} aria-hidden="true" /> Sources {citations.length}</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!hasConversation ? (
              <EmptyState icon={MessageSquareText} title="Start with an operational question" description={defaultCorpusId ? "Atlas retrieves relevant passages, synthesizes an answer, and exposes the evidence used." : "Set NEXT_PUBLIC_DEFAULT_CORPUS_ID before starting a grounded response."} action={defaultCorpusId && <div className="grid gap-2 text-left">{suggestions.map((suggestion) => <button key={suggestion} className="flex min-h-11 items-center justify-between gap-3 border border-line bg-surface-2 px-3 text-left text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink" onClick={() => { setQuery(suggestion); void run(suggestion); }}>{suggestion}<ChevronRight size={14} className="shrink-0" aria-hidden="true" /></button>)}</div>} />
            ) : (
              <div className="divide-y divide-line">
                <article className="flex gap-3 p-4 sm:p-6"><span className="grid size-9 shrink-0 place-items-center border border-line bg-surface-2 text-ink-muted"><UserRound size={17} aria-hidden="true" /></span><div className="min-w-0"><p className="eyebrow">You</p><p className="mt-2 max-w-3xl text-sm leading-7 text-ink">{question}</p></div></article>
                <article className="flex gap-3 p-4 sm:p-6"><span className="grid size-9 shrink-0 place-items-center border border-accent/40 bg-accent/10 text-accent"><Bot size={17} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="eyebrow">Atlas</p>{phase === "done" && <StatusBadge state="operational" label="Grounded" />}</div>
                  {tools.length > 0 && <div className="my-4 border border-line bg-canvas"><p className="flex items-center gap-2 border-b border-line px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint"><Wrench size={13} aria-hidden="true" /> Retrieval trace</p><ul className="divide-y divide-line">{tools.map((tool) => <li key={tool.id} className="flex items-center gap-2 px-3 py-2 text-xs text-ink-muted"><Check size={13} className="text-accent" aria-hidden="true" /><span>{tool.label}</span>{tool.detail && <span className="text-ink-faint">/ {tool.detail}</span>}</li>)}</ul></div>}
                  {answer ? <p className="max-w-3xl whitespace-pre-wrap text-[15px] leading-7 text-ink">{answer}</p> : isStreaming ? <div className="mt-5 flex items-center gap-2 text-sm text-ink-muted"><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />{status}</div> : null}
                  {phase === "cancelled" && <p className="mt-4 border-l-2 border-warning pl-3 text-sm text-ink-muted">Generation stopped. The partial answer remains visible.</p>}
                  {phase === "error" && <div role="alert" className="mt-4 border border-danger/40 bg-danger/10 p-4"><div className="flex gap-2 text-sm text-[#fecdd3]"><AlertCircle size={17} className="shrink-0" aria-hidden="true" /><p>{error}</p></div><button className="btn-secondary mt-4" onClick={() => void run(question)}><RefreshCw size={15} aria-hidden="true" /> Retry response</button></div>}
                  {phase === "done" && <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 font-mono text-[10px] text-ink-faint"><span>{citations.length} citations</span>{usage.inputTokens !== undefined && <span>{usage.inputTokens.toLocaleString()} input tokens</span>}{usage.outputTokens !== undefined && <span>{usage.outputTokens.toLocaleString()} output tokens</span>}{usage.latencyMs !== undefined && <span>{(usage.latencyMs / 1000).toFixed(2)}s total</span>}</div>}
                </div></article>
              </div>
            )}
          </div>
          <ChatComposer value={query} onChange={setQuery} onSubmit={() => void run(query)} onCancel={() => void cancel()} streaming={isStreaming} disabled={!defaultCorpusId} />
        </section>

        <aside className={`${showSources ? "block" : "hidden"} panel min-w-0 lg:block`} aria-label="Citations and sources">
          <div className="flex min-h-14 items-center justify-between border-b border-line px-4"><div><p className="eyebrow">Evidence</p><h2 className="mt-1 font-mono text-sm font-semibold">Citations</h2></div>{showSources && <button className="btn-quiet size-11 p-0 lg:hidden" onClick={() => setShowSources(false)} aria-label="Close sources"><X size={18} aria-hidden="true" /></button>}</div>
          {citations.length === 0 ? <EmptyState icon={FileText} title="No sources yet" description="Retrieved sources and page-level evidence will appear here during the response." /> : <ol className="divide-y divide-line">{citations.map((citation, index) => <li key={citation.id} className="p-4"><div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center border border-line bg-surface-2 font-mono text-[10px] text-accent">{index + 1}</span><div className="min-w-0"><p className="text-sm font-medium leading-5 text-ink">{citation.title}</p><div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] text-ink-faint">{citation.page !== undefined && <span>Page {citation.page}</span>}{citation.section && <span>Section {citation.section}</span>}{citation.score !== undefined && <span>{(citation.score * 100).toFixed(0)}% match</span>}</div></div></div>{citation.quote && <blockquote className="mt-3 border-l border-line-strong pl-3 text-xs leading-5 text-ink-muted">&quot;{citation.quote}&quot;</blockquote>}{citation.uri && <a className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-info hover:text-[#9bd2ff]" href={citation.uri} target="_blank" rel="noreferrer">Open source <ExternalLink size={13} aria-hidden="true" /></a>}</li>)}</ol>}
          {!hasConversation && <div className="border-t border-line p-4"><div className="flex items-start gap-2 text-xs leading-5 text-ink-muted"><Search size={14} className="mt-0.5 shrink-0" aria-hidden="true" />Page and section metadata is shown when provided by the retrieval service.</div></div>}
        </aside>
      </div>
    </div>
  );
}
