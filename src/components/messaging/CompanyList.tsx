"use client";

import React, { useState, useMemo } from "react";
import { useAppData } from "@/components/AppDataContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MapPin, Magnet, ChevronRight } from "lucide-react";
import type { CompanyRow } from "./emailTypes";

interface Props {
  lmMap: Map<string, { ready: boolean; url?: string }>;
  selected: CompanyRow | null;
  onSelect: (row: CompanyRow) => void;
}

export function CompanyList({ lmMap, selected, onSelect }: Props) {
  const { companies, opportunities, pipelines, pipelineStages } = useAppData();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "pipeline">("name");

  const rows = useMemo<CompanyRow[]>(() => companies
    .filter((c) => c.qualifie && c.email)
    .map((company) => {
      const opp = opportunities.find((o) => o.entreprise_id === company.id);
      const pipeline = opp?.pipeline_id ? pipelines.find((p) => p.id === opp.pipeline_id) : undefined;
      const stage = opp?.stage_id ? pipelineStages.find((s) => s.id === opp.stage_id) : undefined;
      const lmInfo = opp ? lmMap.get(opp.id) : undefined;
      return {
        company,
        opportunity: opp,
        pipelineName: pipeline?.nom,
        stageName: stage?.nom,
        hasLeadMagnet: !!lmInfo || (opp?.lead_magnet ?? false),
        leadMagnetReady: lmInfo?.ready ?? false,
        leadMagnetUrl: lmInfo?.url,
      };
    }), [companies, opportunities, pipelines, pipelineStages, lmMap]);

  const filtered = useMemo(() => {
    let result = rows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((row) =>
        (row.company.name ?? "").toLowerCase().includes(q) ||
        (row.company.email ?? "").toLowerCase().includes(q) ||
        (row.company.ville ?? "").toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) =>
      sortBy === "name"
        ? (a.company.name ?? "").localeCompare(b.company.name ?? "")
        : (a.pipelineName ?? "").localeCompare(b.pipelineName ?? "")
    );
  }, [rows, searchQuery, sortBy]);

  return (
    <>
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Rechercher…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-8 pl-8 text-sm" />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {filtered.length} entreprise{filtered.length !== 1 ? "s" : ""}
          </span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Trier par nom</SelectItem>
              <SelectItem value="pipeline">Trier par pipeline</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y">
          {filtered.map((row) => (
            <button
              key={row.company.id}
              onClick={() => onSelect(row)}
              className={`flex w-full items-start gap-2.5 p-3 text-left transition-colors hover:bg-accent ${selected?.company.id === row.company.id ? "bg-accent" : ""}`}
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {(row.company.name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-medium">{row.company.name}</span>
                  {row.leadMagnetReady && <Magnet className="h-3 w-3 shrink-0 text-emerald-500" />}
                </div>
                {row.company.ville && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{row.company.ville}</span>
                  </div>
                )}
                <span className="truncate text-xs text-muted-foreground">{row.company.email}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {row.pipelineName && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{row.pipelineName}</Badge>}
                  {row.stageName && <Badge variant="outline" className="h-4 px-1 text-[10px]">{row.stageName}</Badge>}
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "Aucune entreprise qualifiée avec un email"
                : "Aucun résultat"}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
