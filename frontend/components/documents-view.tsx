"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { AlertCircle, Calendar, Check, ChevronRight, File, FileSearch, Filter, HardDrive, LoaderCircle, RefreshCw, Search, Upload, X } from "lucide-react";
import { defaultCorpusId, getDocuments, uploadDocument } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import type { DocumentState, RagDocument } from "@/lib/types";
import { DemoBadge, EmptyState, PageHeader, Skeleton, StatusBadge } from "@/components/ui";

function documentState(state: DocumentState) {
  if (state === "ready") return { service: "operational" as const, label: "Ready" };
  if (state === "failed") return { service: "down" as const, label: "Failed" };
  if (state === "processing") return { service: "degraded" as const, label: "Processing" };
  return { service: "unknown" as const, label: "Queued" };
}

function DocumentStatus({ status }: { status: DocumentState }) {
  const state = documentState(status);
  return <StatusBadge state={state.service} label={state.label} />;
}

function DetailDrawer({ document, onClose }: { document: RagDocument; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 h-full w-full cursor-default bg-black/70" onClick={onClose} aria-label="Close document details" />
      <aside className="panel-raised absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto" aria-labelledby="document-detail-title" aria-modal="true" role="dialog">
        <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-line bg-surface-2 px-5"><div><p className="eyebrow">Document detail</p><h2 id="document-detail-title" className="mt-1 font-mono text-sm font-semibold">{document.id}</h2></div><button type="button" className="btn-quiet size-11 p-0" onClick={onClose} aria-label="Close details" autoFocus><X size={19} aria-hidden="true" /></button></div>
        <div className="p-5 sm:p-6"><span className="grid size-12 place-items-center border border-line bg-surface-1 text-ink-muted"><File size={22} aria-hidden="true" /></span><h3 className="mt-5 font-mono text-xl font-semibold leading-7">{document.title}</h3><p className="mt-2 break-all text-sm text-ink-muted">{document.filename}</p><div className="mt-4"><DocumentStatus status={document.status} /></div>
          {document.error && <div className="mt-6 border border-danger/40 bg-danger/10 p-4 text-sm leading-6 text-[#fecdd3]"><div className="flex gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{document.error}</div></div>}
          <dl className="mt-8 divide-y divide-line border-y border-line">
            {[
              ["Corpus ID", document.corpus_id], ["Document type", document.document_type], ["Source date", formatDate(document.source_date)], ["Uploaded", formatDate(document.created_at)], ["File size", formatBytes(document.size_bytes)], ["Indexed chunks", document.chunk_count?.toLocaleString() ?? "Pending"],
            ].map(([label, value]) => <div key={label} className="grid grid-cols-[120px_1fr] gap-4 py-4"><dt className="text-xs text-ink-faint">{label}</dt><dd className="break-all font-mono text-xs text-ink">{value}</dd></div>)}
          </dl>
          <div className="mt-6 border border-line bg-canvas p-4"><p className="eyebrow">Index lifecycle</p><ol className="mt-4 space-y-4">{["Object stored", "Text extracted", "Chunks embedded", "Search index committed"].map((step, index) => { const complete = document.status === "ready" || index === 0; return <li key={step} className="flex items-center gap-3 text-xs"><span className={`grid size-6 place-items-center border ${complete ? "border-accent/40 bg-accent/10 text-accent" : "border-line text-ink-faint"}`}>{complete ? <Check size={13} aria-hidden="true" /> : index + 1}</span><span className={complete ? "text-ink" : "text-ink-faint"}>{step}</span></li>; })}</ol></div>
        </div>
      </aside>
    </div>
  );
}

function UploadDrawer({ onClose, onUploaded }: { onClose: () => void; onUploaded: (document: RagDocument) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("policy");
  const [sourceDate, setSourceDate] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<(() => void) | null>(null);

  function selectFile(selected: File | null) {
    setFile(selected);
    if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !title.trim() || !defaultCorpusId) return;
    setError("");
    setUploading(true);
    setProgress(0);
    const upload = uploadDocument({ file, title: title.trim(), documentType, corpusId: defaultCorpusId, sourceDate: sourceDate || undefined }, setProgress);
    abortRef.current = upload.abort;
    try {
      const document = await upload.promise;
      onUploaded(document);
      onClose();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "The document could not be uploaded.");
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    if (uploading) abortRef.current?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 h-full w-full cursor-default bg-black/70" onClick={cancel} aria-label="Close upload form" />
      <aside className="panel-raised absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto" aria-labelledby="upload-title" aria-modal="true" role="dialog">
        <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-line bg-surface-2 px-5"><div><p className="eyebrow">Corpus ingestion</p><h2 id="upload-title" className="mt-1 font-mono text-sm font-semibold">Upload document</h2></div><button type="button" className="btn-quiet size-11 p-0" onClick={cancel} aria-label="Close upload form" autoFocus><X size={19} aria-hidden="true" /></button></div>
        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          {!defaultCorpusId && <div role="alert" className="border border-warning/40 bg-warning/10 p-4 text-sm text-[#fde68a]">Set <code className="font-mono">NEXT_PUBLIC_DEFAULT_CORPUS_ID</code> before uploading documents.</div>}
          <div><label htmlFor="document-file" className="mb-2 block text-sm font-medium">File <span className="text-danger">*</span></label><label htmlFor="document-file" className="flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed border-line-strong bg-canvas p-5 text-center transition-colors hover:border-accent"><Upload size={22} className="text-ink-faint" aria-hidden="true" /><span className="mt-3 text-sm font-medium text-ink">{file ? file.name : "Choose a document"}</span><span className="mt-1 text-xs text-ink-faint">PDF, DOCX, TXT, Markdown, or CSV</span></label><input id="document-file" className="sr-only" type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} required /></div>
          <div><label htmlFor="document-title" className="mb-2 block text-sm font-medium">Title <span className="text-danger">*</span></label><input id="document-title" className="field" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Human-readable document title" /></div>
          <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="document-type" className="mb-2 block text-sm font-medium">Document type</label><select id="document-type" className="field" value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="policy">Policy</option><option value="technical">Technical</option><option value="handbook">Handbook</option><option value="meeting_minutes">Meeting minutes</option><option value="dataset">Dataset</option><option value="other">Other</option></select></div><div><label htmlFor="source-date" className="mb-2 block text-sm font-medium">Source date</label><input id="source-date" className="field" type="date" value={sourceDate} onChange={(event) => setSourceDate(event.target.value)} /></div></div>
          <div><p className="mb-2 text-sm font-medium">Corpus</p><div className="min-h-11 border border-line bg-canvas px-3 py-3 font-mono text-xs text-ink-muted">{defaultCorpusId || "Not configured"}</div></div>
          {uploading && <div aria-live="polite"><div className="mb-2 flex justify-between font-mono text-xs"><span>Uploading and registering</span><span>{progress}%</span></div><div className="h-2 bg-surface-3" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div></div>}
          {error && <div role="alert" className="flex gap-2 border border-danger/40 bg-danger/10 p-4 text-sm text-[#fecdd3]"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</div>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={cancel}>{uploading ? "Cancel upload" : "Cancel"}</button><button type="submit" className="btn-primary" disabled={uploading || !file || !title.trim() || !defaultCorpusId}>{uploading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}{uploading ? "Uploading" : "Upload document"}</button></div>
        </form>
      </aside>
    </div>
  );
}

export function DocumentsView() {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DocumentState>("all");
  const [selected, setSelected] = useState<RagDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    try { const result = await getDocuments(); setDocuments(result.documents); setDemo(result.demo); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => {
    let current = true;
    void getDocuments().then((result) => {
      if (!current) return;
      setDocuments(result.documents);
      setDemo(result.demo);
      setLoading(false);
    });
    return () => { current = false; };
  }, []);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filtered = documents.filter((document) => (status === "all" || document.status === status) && (!normalizedQuery || `${document.title} ${document.filename} ${document.document_type} ${document.corpus_id}`.toLowerCase().includes(normalizedQuery)));

  return (
    <div>
      <PageHeader eyebrow="Corpus / Documents" title="Document inventory" description="Upload, inspect, and trace source documents through the retrieval index lifecycle." actions={<>{demo && <DemoBadge />}<button className="btn-secondary" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden="true" /> Refresh</button><button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16} aria-hidden="true" /> Upload</button></>} />
      <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
        <section className="panel" aria-label="Documents">
          <div className="grid gap-3 border-b border-line p-3 sm:p-4 md:grid-cols-[minmax(260px,1fr)_200px_auto]">
            <label className="relative"><span className="sr-only">Search documents</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" /><input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, filename, type..." /></label>
            <label className="relative"><span className="sr-only">Filter by state</span><Filter size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" /><select className="field pl-10" value={status} onChange={(event) => setStatus(event.target.value as "all" | DocumentState)}><option value="all">All states</option><option value="ready">Ready</option><option value="processing">Processing</option><option value="queued">Queued</option><option value="failed">Failed</option></select></label>
            <div className="flex min-h-11 items-center justify-end px-2 font-mono text-xs text-ink-faint">{filtered.length} of {documents.length} documents</div>
          </div>

          {loading ? <div className="space-y-px bg-line" role="status" aria-label="Loading documents">{[0,1,2,3,4].map((item) => <div className="grid grid-cols-4 gap-5 bg-surface-1 p-5" key={item}><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" /></div>)}</div> : filtered.length === 0 ? <EmptyState icon={FileSearch} title="No documents found" description="Adjust the search or state filter, or upload a new source document." action={<button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16} aria-hidden="true" /> Upload document</button>} /> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-line bg-surface-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint"><tr><th className="px-5 py-3 font-medium">Document</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">State</th><th className="px-4 py-3 font-medium">Chunks</th><th className="px-4 py-3 font-medium">Size</th><th className="px-4 py-3 font-medium">Uploaded</th><th className="px-5 py-3 text-right font-medium">Details</th></tr></thead><tbody className="divide-y divide-line">{filtered.map((document) => <tr key={document.id} className="transition-colors hover:bg-surface-2"><td className="max-w-sm px-5 py-4"><p className="truncate font-medium text-ink" title={document.title}>{document.title}</p><p className="mt-1 truncate font-mono text-[10px] text-ink-faint" title={document.filename}>{document.filename}</p></td><td className="px-4 py-4 text-xs text-ink-muted">{document.document_type.replaceAll("_", " ")}</td><td className="px-4 py-4"><DocumentStatus status={document.status} /></td><td className="data-value px-4 py-4 text-xs">{document.chunk_count?.toLocaleString() ?? "N/A"}</td><td className="px-4 py-4 font-mono text-xs text-ink-muted">{formatBytes(document.size_bytes)}</td><td className="px-4 py-4 text-xs text-ink-muted">{formatDate(document.created_at)}</td><td className="px-5 py-4 text-right"><button className="btn-quiet size-11 p-0" onClick={() => setSelected(document)} aria-label={`View ${document.title}`}><ChevronRight size={18} aria-hidden="true" /></button></td></tr>)}</tbody></table></div>
            <ul className="divide-y divide-line md:hidden">{filtered.map((document) => <li key={document.id}><button className="flex min-h-24 w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-2" onClick={() => setSelected(document)}><span className="grid size-10 shrink-0 place-items-center border border-line bg-surface-2 text-ink-muted"><File size={18} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{document.title}</span><span className="mt-1 block truncate font-mono text-[10px] text-ink-faint">{document.filename}</span><span className="mt-2 block"><DocumentStatus status={document.status} /></span></span><ChevronRight size={17} className="shrink-0 text-ink-faint" aria-hidden="true" /></button></li>)}</ul>
          </>}
        </section>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] text-ink-faint"><span className="flex items-center gap-1.5"><HardDrive size={13} aria-hidden="true" /> Corpus {defaultCorpusId ? `${defaultCorpusId.slice(0, 12)}...` : "not configured"}</span><span className="flex items-center gap-1.5"><Calendar size={13} aria-hidden="true" /> Dates shown in local time</span></div>
      </div>
      {selected && <DetailDrawer document={selected} onClose={() => setSelected(null)} />}
      {uploadOpen && <UploadDrawer onClose={() => setUploadOpen(false)} onUploaded={(document) => { setDocuments((current) => [document, ...current]); setDemo(false); }} />}
    </div>
  );
}
