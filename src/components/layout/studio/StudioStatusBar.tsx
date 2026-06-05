"use client";

import React from "react";
import { useAuth } from "@/components/AuthContext";

/** Thin monospace status bar pinned to the bottom of the content column. */
export function StudioStatusBar() {
  const { user } = useAuth();

  return (
    <footer className="hidden h-7 shrink-0 items-center gap-3 border-t border-border bg-background px-3.5 font-mono text-[11px] text-[var(--text-3)] md:flex">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
        Connecté · Supabase
      </span>
      <span className="text-[var(--text-4)]">·</span>
      <span className="truncate">{user?.name ?? "Sama CRM"}</span>
      <span className="ml-auto">Studio v2.0</span>
    </footer>
  );
}

export default StudioStatusBar;
