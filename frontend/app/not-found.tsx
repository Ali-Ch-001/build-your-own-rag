import Link from "next/link";
import { ArrowLeft, Map } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-[calc(100dvh-4rem)] place-items-center p-5 lg:min-h-dvh">
      <div className="max-w-lg text-center">
        <Map className="mx-auto text-ink-faint" size={36} aria-hidden="true" />
        <p className="eyebrow mt-6">Error 404</p>
        <h1 className="mt-2 font-mono text-3xl font-semibold">Route outside the atlas</h1>
        <p className="mt-3 text-ink-muted">The requested control-plane destination does not exist.</p>
        <Link href="/" className="btn-primary mt-6"><ArrowLeft size={16} aria-hidden="true" /> Return to overview</Link>
      </div>
    </div>
  );
}
