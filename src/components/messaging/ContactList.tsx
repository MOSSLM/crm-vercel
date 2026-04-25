"use client";

import React, { useState, useMemo } from "react";
import { useAppData } from "@/components/AppDataContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Filter, Building2, Magnet, ChevronRight } from "lucide-react";
import type { ContactRow } from "./emailTypes";

interface Props {
  lmMap: Map<string, { ready: boolean; url?: string }>;
  selected: ContactRow | null;
  onSelect: (row: ContactRow) => void;
}

export function ContactList({ lmMap, selected, onSelect }: Props) {
  const { contacts, opportunities, companies, pipelines, pipelineStages } = useAppData();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterPipeline, setFilterPipeline] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [filterLm, setFilterLm] = useState<"all" | "with_lm" | "lm_ready" | "no_lm">("all");
  const [filterHasEmail, setFilterHasEmail] = useState(true);

  const rows = useMemo<ContactRow[]>(() => contacts.map((contact) => {
    const company = companies.find((c) => c.id === contact.entreprise_id);
    const opp = opportunities.find(
      (o) => o.contact_id === contact.id || o.entreprise_id === contact.entreprise_id
    );
    const pipeline = opp?.pipeline_id ? pipelines.find((p) => p.id === opp.pipeline_id) : undefined;
    const stage = opp?.stage_id ? pipelineStages.find((s) => s.id === opp.stage_id) : undefined;
    const lmInfo = opp ? lmMap.get(opp.id) : undefined;
    return {
      contact,
      opportunity: opp,
      companyName: company?.name ?? `Entreprise #${contact.entreprise_id}`,
      pipelineName: pipeline?.nom,
      stageName: stage?.nom,
      hasLeadMagnet: !!lmInfo || (opp?.lead_magnet ?? false),
      leadMagnetReady: lmInfo?.ready ?? false,
      leadMagnetUrl: lmInfo?.url,
    };
  }), [contacts, opportunities, companies, pipelines, pipelineStages, lmMap]);

  const availableStages = useMemo(() =>
    filterPipeline === "all" ? pipelineStages : pipelineStages.filter((s) => s.pipeline_id === filterPipeline),
    [filterPipeline, pipelineStages]
  );

  const filtered = useMemo(() => rows.filter((row) => {
    if (filterHasEmail && !row.contact.email) return false;
    if (filterPipeline !== "all" && row.opportunity?.pipeline_id !== filterPipeline) return false;
    if (filterStage !== "all" && String(row.opportunity?.stage_id) !== filterStage) return false;
    if (filterLm === "with_lm" && !row.hasLeadMagnet) return false;
    if (filterLm === "lm_ready" && !row.leadMagnetReady) return false;
    if (filterLm === "no_lm" && row.hasLeadMagnet) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = `${row.contact.first_name ?? ""} ${row.contact.last_name ?? ""}`.toLowerCase();
      if (!name.includes(q) && !row.companyName.toLowerCase().includes(q) && !(row.contact.email ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, filterHasEmail, filterPipeline, filterStage, filterLm, searchQuery]);

  return (
    <>
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Rechercher…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-8 pl-8 text-sm" />
        </div>

        <div className="flex gap-1.5">
          <Select value={filterPipeline} onValueChange={(v) => { setFilterPipeline(v); setFilterStage("all"); }}>
            <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Pipeline" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous pipelines</SelectItem>
              {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterLm} onValueChange={(v) => setFilterLm(v as typeof filterLm)}>
            <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Lead Magnet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="with_lm">Avec LM</SelectItem>
              <SelectItem value="lm_ready">LM prêt</SelectItem>
              <SelectItem value="no_lm">Sans LM</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filterPipeline !== "all" && (
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="h-7 w-full text-xs"><SelectValue placeholder="Étape" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes étapes</SelectItem>
              {availableStages.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{filtered.length} contact{filtered.length !== 1 ? "s" : ""}</span>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => setFilterHasEmail(!filterHasEmail)}>
            <Filter className="h-3 w-3" />
            {filterHasEmail ? "Email requis" : "Tous"}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y">
          {filtered.map((row) => (
            <button
              key={row.contact.id}
              onClick={() => onSelect(row)}
              className={`flex w-full items-start gap-2.5 p-3 text-left transition-colors hover:bg-accent ${selected?.contact.id === row.contact.id ? "bg-accent" : ""}`}
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {(row.contact.first_name?.[0] ?? row.companyName[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-medium">{row.contact.first_name} {row.contact.last_name}</span>
                  {row.leadMagnetReady && <Magnet className="h-3 w-3 shrink-0 text-emerald-500" />}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{row.companyName}</span>
                </div>
                {row.contact.email
                  ? <span className="truncate text-xs text-muted-foreground">{row.contact.email}</span>
                  : <span className="text-xs text-destructive/70">Pas d&apos;email</span>
                }
                <div className="mt-1 flex flex-wrap gap-1">
                  {row.pipelineName && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{row.pipelineName}</Badge>}
                  {row.stageName && <Badge variant="outline" className="h-4 px-1 text-[10px]">{row.stageName}</Badge>}
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucun contact trouvé</div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
