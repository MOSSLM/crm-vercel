"use client";

import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Briques partagées par les sections de Relations › Agents. Extraites de
 * `AgentsAdmin.tsx` quand l'écran a gagné la revue de qualification, les
 * permissions et le journal d'activité — il devenait trop gros pour rester
 * d'un seul tenant.
 */

export type Agent = { id: string; full_name: string | null; email: string | null };
export type Ent = { id: number; name: string | null; ville: string | null; telephone: string | null };

export function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function agentLabel(a: Agent | null): string {
  if (!a) return "Agent";
  return a.full_name?.trim() || a.email || "Agent";
}

export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

/** Montant en centimes → « 12,50 € ». */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

/** Fixed-height panel with its own scrollbar, so the page never grows with the list. */
export function ListPanel({
  title,
  icon,
  count,
  hint,
  search,
  onSearch,
  searchPlaceholder,
  actions,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  hint: string;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-[32rem] flex-col rounded-xl border bg-card">
      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {icon} {title} <span className="text-muted-foreground">({count})</span>
          </h2>
          {actions}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {onSearch && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search ?? ""}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 text-sm"
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
