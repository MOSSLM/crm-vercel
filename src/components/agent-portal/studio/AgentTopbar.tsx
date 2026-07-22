"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Home, Search } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/components/AuthContext";
import { getAgentSpaceById, getAgentSpaceFromPath, getAllAgentTools } from "@/components/agent-portal/agentSpaces";

function initialsOf(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function usePageTitle(pathname: string) {
  const tools = React.useMemo(() => getAllAgentTools(), []);
  const match = tools.find(
    (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
  );
  return match?.title ?? "Espace agent";
}

/**
 * Agent shell topbar: workspace pill + breadcrumbs + universal search (⌘K)
 * + theme toggle. Mirrors the admin StudioTopbar.
 */
export function AgentTopbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const pathname = usePathname() ?? "";
  const title = usePageTitle(pathname);
  const { user } = useAuth();
  const space = getAgentSpaceById(getAgentSpaceFromPath(pathname));

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:h-16 md:px-4">
      {/* Workspace pill */}
      <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-[var(--surface)] py-1 pl-1 pr-2.5 sm:flex">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {initialsOf(user?.name)}
        </span>
        <span className="max-w-[120px] truncate text-xs font-medium">{user?.name ?? "Espace agent"}</span>
      </div>

      {/* Breadcrumbs */}
      <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Fil d'Ariane">
        <Home className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
        <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-4)]" />
        <span className="hidden shrink-0 text-[var(--text-3)] lg:inline">{space.label}</span>
        <ChevronRight className="hidden h-3 w-3 shrink-0 text-[var(--text-4)] lg:inline" />
        <span className="truncate font-medium text-foreground">{title}</span>
      </nav>

      {/* Universal search → ⌘K */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="ml-auto flex h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-border/60 bg-[var(--surface)] px-3 text-sm text-[var(--text-3)] transition-colors hover:border-border hover:bg-[var(--bg-2)] md:ml-4"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate text-left">Rechercher un outil, une action…</span>
        <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border border-border bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)] sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}

export default AgentTopbar;
