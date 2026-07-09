"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="grid min-h-[calc(100dvh-4rem)] place-items-center p-5 lg:min-h-dvh">
      <div className="panel max-w-lg p-6 sm:p-8">
        <AlertTriangle className="text-danger" size={28} aria-hidden="true" />
        <p className="eyebrow mt-6">Application error</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold">The workspace could not be rendered</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">The failure was contained. Retry the route; if it persists, review the browser and API logs.</p>
        <button type="button" onClick={reset} className="btn-primary mt-6"><RotateCcw size={16} aria-hidden="true" /> Retry</button>
      </div>
    </div>
  );
}
