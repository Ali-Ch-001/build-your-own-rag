"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BookOpenText, Bot, Database, FileStack, LogIn, LogOut, Menu, MessageSquareText, Settings, SlidersHorizontal, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

const navItems = [
  { href: "/chat", label: "Chat", icon: MessageSquareText },
  { href: "/documents", label: "Documents", icon: FileStack },
  { href: "/ingestion", label: "Ingestion", icon: Database },
  { href: "/evaluation", label: "Evaluation", icon: SlidersHorizontal },
  { href: "/operations", label: "Operations", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

function AtlasMark() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-3 focus-visible:outline-offset-4" aria-label="Atlas RAG overview">
      <span className="grid size-9 place-items-center border border-accent bg-accent/10 text-accent">
        <Bot aria-hidden="true" size={19} strokeWidth={1.8} />
      </span>
      <span>
        <span className="block font-mono text-sm font-semibold tracking-tight text-ink">ATLAS RAG</span>
        <span className="block font-mono text-[10px] tracking-[0.16em] text-ink-faint">CONTROL PLANE</span>
      </span>
    </Link>
  );
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary navigation" className="mt-8">
      <p className="eyebrow px-3">Workspace</p>
      <ul className="mt-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-11 items-center gap-3 border-l-2 px-3 text-sm font-medium transition-colors duration-200 ${
                  active ? "border-accent bg-accent/8 text-ink" : "border-transparent text-ink-muted hover:border-line-strong hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icon size={18} strokeWidth={1.8} className={active ? "text-accent" : "text-ink-faint group-hover:text-ink-muted"} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RailFooter() {
  const auth = useAuth();
  return (
    <div className="mt-auto border-t border-line pt-5">
      <div className="flex items-center gap-3 px-3">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping bg-accent opacity-40" />
          <span className="relative inline-flex size-2 bg-accent" />
        </span>
        <div>
          <p className="font-mono text-xs font-medium text-ink">Production</p>
          <p className="text-xs text-ink-faint">us-east-1</p>
        </div>
      </div>
      <Link href="/" className="mt-4 flex min-h-11 items-center gap-3 px-3 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink">
        <BookOpenText size={17} aria-hidden="true" /> System overview
      </Link>
      {auth.configured && (
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          disabled={auth.loading}
          onClick={() => void (auth.authenticated ? auth.logout() : auth.login())}
        >
          {auth.authenticated ? <LogOut size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
          {auth.loading ? "Checking identity" : auth.authenticated ? `Sign out${auth.user?.name ? ` / ${auth.user.name}` : ""}` : "Sign in with Auth0"}
        </button>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      document.getElementById("main-content")?.focus();
      previousPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a href="#main-content" className="fixed left-4 top-3 z-[100] -translate-y-20 bg-accent px-4 py-3 font-semibold text-accent-ink focus:translate-y-0">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-surface-1 p-5 lg:flex lg:flex-col">
        <AtlasMark />
        <Navigation pathname={pathname} />
        <RailFooter />
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-canvas/95 px-4 lg:hidden">
        <AtlasMark />
        <button type="button" className="btn-quiet size-11 p-0" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}>
          <Menu size={22} aria-hidden="true" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 h-full w-full cursor-default bg-black/70" aria-label="Close navigation overlay" onClick={() => setOpen(false)} />
          <aside className="panel-raised relative flex h-full w-[min(86vw,320px)] flex-col p-5" aria-label="Mobile navigation" aria-modal="true" role="dialog">
            <div className="flex items-center justify-between">
              <AtlasMark />
              <button type="button" className="btn-quiet size-11 p-0" onClick={() => setOpen(false)} aria-label="Close navigation" autoFocus>
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <Navigation pathname={pathname} onNavigate={() => setOpen(false)} />
            <RailFooter />
          </aside>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="min-h-dvh pt-16 lg:ml-64 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
