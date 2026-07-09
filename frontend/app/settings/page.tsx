import type { Metadata } from "next";
import { Box, Check, Cloud, ExternalLink, LockKeyhole, Search, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader, SectionPanel, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

const integrations = [
  { name: "OpenAI", description: "Generation and embedding models", env: "OPENAI_API_KEY", icon: Sparkles, ready: true },
  { name: "Tavily", description: "External web search retrieval", env: "TAVILY_API_KEY", icon: Search, ready: false },
  { name: "Auth0", description: "OIDC identity and tenant access", env: "AUTH0_DOMAIN + AUTH0_CLIENT_ID", icon: ShieldCheck, ready: true },
  { name: "AWS", description: "Object storage and runtime identity", env: "AWS IAM role / workload identity", icon: Cloud, ready: true },
];

export default function SettingsPage() {
  return (
    <div>
      <PageHeader eyebrow="Control plane / Settings" title="Integration readiness" description="Review service connectivity and the server-side configuration required for production operation." />
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="border border-info/40 bg-info/5 p-5" aria-labelledby="secret-safety-title">
          <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center border border-info/40 bg-info/10 text-info"><LockKeyhole size={20} aria-hidden="true" /></span><div><h2 id="secret-safety-title" className="font-mono text-sm font-semibold">Secrets stay on the server</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Provider keys, client secrets, and cloud credentials must be configured in the backend runtime or a managed secret store. This browser console never requests, stores, or forwards secret values through local storage.</p></div></div>
        </section>

        <SectionPanel title="Provider integrations" eyebrow="Configuration health" action={<span className="font-mono text-xs text-ink-muted">3 / 4 ready</span>}>
          <div className="grid gap-px bg-line md:grid-cols-2">
            {integrations.map((integration) => { const Icon = integration.icon; return (
              <article key={integration.name} className="bg-surface-1 p-5">
                <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center border border-line bg-surface-2 text-ink-muted"><Icon size={20} aria-hidden="true" /></span><StatusBadge state={integration.ready ? "operational" : "unknown"} label={integration.ready ? "Configured" : "Not configured"} /></div>
                <h3 className="mt-5 font-mono text-base font-semibold">{integration.name}</h3><p className="mt-1 text-sm text-ink-muted">{integration.description}</p>
                <div className="mt-5 border-t border-line pt-4"><p className="eyebrow">Server requirement</p><code className="mt-2 block break-words font-mono text-xs text-[#9bd2ff]">{integration.env}</code></div>
              </article>
            ); })}
          </div>
        </SectionPanel>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <SectionPanel title="Secure configuration path" eyebrow="Recommended deployment">
            <ol className="divide-y divide-line">
              {[
                ["01", "Create runtime secrets", "Use AWS Secrets Manager, your orchestrator secret store, or encrypted CI variables."],
                ["02", "Bind server identity", "Prefer IAM roles and workload identity over long-lived access keys."],
                ["03", "Restart backend services", "Load secret references only in the API and worker processes."],
                ["04", "Verify health checks", "Confirm readiness and run a grounded response smoke test."],
              ].map(([number, title, body]) => <li key={number} className="flex gap-4 p-5"><span className="font-mono text-xs text-accent">{number}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{body}</p></div></li>)}
            </ol>
          </SectionPanel>

          <SectionPanel title="Browser-safe configuration" eyebrow="Frontend environment">
            <div className="p-5"><div className="flex items-center gap-3"><Box size={18} className="text-ink-faint" aria-hidden="true" /><p className="text-sm font-medium">Permitted public values</p></div><div className="mt-4 space-y-2"><code className="block border border-line bg-canvas px-3 py-3 font-mono text-xs text-ink-muted">NEXT_PUBLIC_API_URL</code><code className="block border border-line bg-canvas px-3 py-3 font-mono text-xs text-ink-muted">NEXT_PUBLIC_DEFAULT_CORPUS_ID</code></div><div className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-xs leading-5 text-ink-muted"><Check size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />These values identify public endpoints and corpus scope; they do not grant provider access.</div></div>
          </SectionPanel>
        </div>

        <section className="panel flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><Settings2 size={19} className="text-ink-faint" aria-hidden="true" /><div><p className="text-sm font-medium">Backend configuration reference</p><p className="mt-1 text-xs text-ink-muted">Use your deployment runbook for environment-specific secret names and rotation policy.</p></div></div><a className="btn-secondary shrink-0" href="https://12factor.net/config" target="_blank" rel="noreferrer">Configuration guidance <ExternalLink size={15} aria-hidden="true" /></a></section>
      </div>
    </div>
  );
}
