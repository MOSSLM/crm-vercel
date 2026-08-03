"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ExternalLink,
  FileText,
  Globe,
  Inbox,
  Layers,
  Loader2,
  MapPin,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ListPanel, EmptyRow, FilterSelect, matches } from "./shared";

/**
 * Les deux listes de l'écran Agents : le pool à donner, et ce que l'agent a
 * déjà. Sorties d'`AgentsAdmin` quand elles ont gagné le filtre par pipeline et
 * la sélection multiple — donner cinquante entreprises d'un pipeline ne peut
 * pas passer par cinquante clics « Attribuer ».
 */

/** Une affaire du prospect, telle que la renvoient les routes admin. */
export type Deal = {
  pipeline_id: string;
  pipeline_nom: string;
  stage_id: number | null;
  stage_nom: string | null;
};
export type PipelineOption = { id: string; nom: string; ordre: number };
export type StageOption = { id: number; nom: string; pipeline_id: string; ordre: number };

export type PoolProspect = {
  id: number;
  name: string | null;
  ville: string | null;
  telephone: string | null;
  deals: Deal[];
};

export type AgentProspect = {
  id: number;
  name: string | null;
  ville: string | null;
  deals?: Deal[];
  enriched?: boolean;
  data_validated?: boolean;
  audit: { statut: string; url: string | null; ready: boolean } | null;
  demo: { url: string | null; is_published: boolean; build_stage: string | null; ready: boolean } | null;
};

/** Valeur du filtre pipeline pour « aucune affaire dans aucun pipeline ». */
const NO_PIPELINE = "__none__";
/** Au-delà, on demande confirmation avant de partir sur un lot. */
const CONFIRM_ABOVE = 25;
/** Plafond serveur d'un lot (cf. `/api/admin/assign`). */
const MAX_BATCH = 200;

/* ------------------------------------------------------------------ */
/* Sélection                                                           */
/* ------------------------------------------------------------------ */

/**
 * Sélection de lignes avec plage au Maj+clic, et purge automatique des ids qui
 * ont quitté la liste — sans quoi une entreprise attribuée resterait comptée
 * dans « 12 sélectionnées » alors qu'elle n'est plus affichée.
 */
function useRowSelection(visibleIds: number[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchorRef = useRef<number | null>(null);

  // `visibleIds` est mémoïsé par les panneaux : la purge ne se déclenche qu'aux
  // vrais changements de liste (rechargement, filtre), pas à chaque rendu.
  useEffect(() => {
    const present = new Set(visibleIds);
    setSelected((cur) => {
      const next = new Set([...cur].filter((id) => present.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [visibleIds]);

  const toggle = useCallback(
    (index: number, extend: boolean) => {
      const id = visibleIds[index];
      if (id == null) return;
      setSelected((cur) => {
        const next = new Set(cur);
        if (extend && anchorRef.current != null) {
          const [from, to] = [anchorRef.current, index].sort((a, b) => a - b);
          const turnOn = !cur.has(id);
          for (let i = from; i <= to; i++) {
            const rowId = visibleIds[i];
            if (rowId == null) continue;
            if (turnOn) next.add(rowId);
            else next.delete(rowId);
          }
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      anchorRef.current = index;
    },
    [visibleIds],
  );

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected((cur) => {
      const everySelected = visibleIds.length > 0 && visibleIds.every((id) => cur.has(id));
      if (everySelected) {
        const next = new Set(cur);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...cur, ...visibleIds]);
    });
    anchorRef.current = null;
  }, [visibleIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  return { selected, toggle, toggleAll, allSelected, clear };
}

/* ------------------------------------------------------------------ */
/* Briques d'affichage                                                 */
/* ------------------------------------------------------------------ */

/** Les 4 étapes de production, telles que l'agent les voit sur son board. */
export function PipelineSteps({ p }: { p: AgentProspect }) {
  const steps: { label: string; done: boolean }[] = [
    { label: "Enrichi", done: p.enriched === true },
    { label: "Données validées", done: p.data_validated === true },
    { label: "Site démo", done: p.demo?.ready === true },
    { label: "Audit", done: p.audit?.ready === true },
  ];
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {steps.map((s) => (
        <Badge
          key={s.label}
          variant={s.done ? "default" : "outline"}
          className="gap-1 text-[11px] font-normal"
        >
          {s.done && <Check className="h-3 w-3" />}
          {s.label}
        </Badge>
      ))}
    </div>
  );
}

/** Combien des 4 étapes sont franchies — sert au filtre « prêtes à envoyer ». */
export const readySteps = (p: AgentProspect): number =>
  [p.enriched === true, p.data_validated === true, p.demo?.ready === true, p.audit?.ready === true].filter(
    Boolean,
  ).length;

function DealBadges({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) {
    return (
      <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
        Sans pipeline
      </Badge>
    );
  }
  return (
    <>
      {deals.map((d) => (
        <Badge
          key={d.pipeline_id}
          variant="secondary"
          className="gap-1 text-[11px] font-normal"
          title={d.stage_nom ? `${d.pipeline_nom} · ${d.stage_nom}` : d.pipeline_nom}
        >
          <Layers className="h-3 w-3" />
          {d.pipeline_nom}
          {d.stage_nom && <span className="text-muted-foreground">· {d.stage_nom}</span>}
        </Badge>
      ))}
    </>
  );
}

/** Ligne sélectionnable : le clic n'importe où bascule la case, Maj étend. */
function SelectableRow({
  index,
  selected,
  disabled,
  onToggle,
  children,
}: {
  index: number;
  selected: boolean;
  disabled?: boolean;
  onToggle: (index: number, extend: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={(e) => onToggle(index, e.shiftKey)}
      className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
        selected ? "border-primary/50 bg-primary/5" : "bg-background hover:bg-muted/50"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        {/* La case pilote la même bascule que la ligne — Maj compris — au lieu
            de passer par `onCheckedChange`, qui ne porte pas l'événement. */}
        <Checkbox
          checked={selected}
          className="mt-0.5 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(index, e.shiftKey);
          }}
          aria-label="Sélectionner cette entreprise"
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

/** Barre d'actions de masse, identique des deux côtés. */
function BulkBar({
  total,
  selectedCount,
  allSelected,
  onToggleAll,
  onClear,
  busy,
  children,
}: {
  total: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={onToggleAll}
        disabled={total === 0 || busy}
        className="flex items-center gap-2 text-xs disabled:opacity-50"
      >
        <Checkbox checked={allSelected} className="pointer-events-none" tabIndex={-1} />
        {selectedCount > 0
          ? `${selectedCount} sélectionnée${selectedCount > 1 ? "s" : ""}`
          : `Tout sélectionner (${total})`}
      </button>
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <Button size="sm" variant="ghost" className="h-8" onClick={onClear} disabled={busy}>
            Annuler
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pool disponible                                                     */
/* ------------------------------------------------------------------ */

export function PoolPanel({
  prospects,
  pipelines,
  stages,
  truncated,
  loading,
  agentName,
  canAssign,
  busyId,
  bulkBusy,
  onAssign,
}: {
  prospects: PoolProspect[];
  pipelines: PipelineOption[];
  stages: StageOption[];
  truncated: boolean;
  loading: boolean;
  agentName: string;
  canAssign: boolean;
  busyId: number | null;
  bulkBusy: boolean;
  onAssign: (ids: number[]) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [sort, setSort] = useState<"name" | "ville" | "pipeline">("name");

  // Une étape n'a de sens qu'à l'intérieur d'un pipeline donné.
  useEffect(() => {
    setStageId("");
  }, [pipelineId]);

  const searched = useMemo(
    () => prospects.filter((e) => matches(query, e.name, e.ville, e.telephone)),
    [prospects, query],
  );

  /** Combien d'entreprises par pipeline, dans ce que la recherche a laissé. */
  const pipelineCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const e of searched) {
      if (e.deals.length === 0) none++;
      for (const id of new Set(e.deals.map((d) => d.pipeline_id))) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return { counts, none };
  }, [searched]);

  const stageCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!pipelineId || pipelineId === NO_PIPELINE) return counts;
    for (const e of searched) {
      for (const d of e.deals) {
        if (d.pipeline_id !== pipelineId || d.stage_id == null) continue;
        counts.set(d.stage_id, (counts.get(d.stage_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [searched, pipelineId]);

  const filtered = useMemo(() => {
    const rows = searched.filter((e) => {
      if (!pipelineId) return true;
      if (pipelineId === NO_PIPELINE) return e.deals.length === 0;
      return e.deals.some(
        (d) => d.pipeline_id === pipelineId && (!stageId || String(d.stage_id) === stageId),
      );
    });

    const byName = (a: PoolProspect, b: PoolProspect) =>
      (a.name ?? "").localeCompare(b.name ?? "", "fr");
    return [...rows].sort((a, b) => {
      if (sort === "ville") return (a.ville ?? "").localeCompare(b.ville ?? "", "fr") || byName(a, b);
      if (sort === "pipeline") {
        const label = (p: PoolProspect) => p.deals[0]?.pipeline_nom ?? "￿";
        return label(a).localeCompare(label(b), "fr") || byName(a, b);
      }
      return byName(a, b);
    });
  }, [searched, pipelineId, stageId, sort]);

  const visibleIds = useMemo(() => filtered.map((e) => e.id), [filtered]);
  const { selected, toggle, toggleAll, allSelected, clear } = useRowSelection(visibleIds);

  const assignSelected = () => {
    const ids = visibleIds.filter((id) => selected.has(id));
    if (ids.length === 0) return;
    if (ids.length > MAX_BATCH) {
      window.alert(`Maximum ${MAX_BATCH} entreprises à la fois — affine le filtre.`);
      return;
    }
    if (
      ids.length > CONFIRM_ABOVE &&
      !window.confirm(`Attribuer ${ids.length} entreprises à ${agentName} ?`)
    ) {
      return;
    }
    void onAssign(ids);
  };

  const pipelineOptions = pipelines.filter(
    (p) => (pipelineCounts.counts.get(p.id) ?? 0) > 0 || p.id === pipelineId,
  );
  const stageOptions = stages
    .filter((s) => s.pipeline_id === pipelineId)
    .filter((s) => (stageCounts.get(s.id) ?? 0) > 0 || String(s.id) === stageId);

  return (
    <ListPanel
      title="Pool disponible"
      icon={<Inbox className="h-4 w-4" />}
      count={filtered.length}
      hint="Entreprises qualifiées sans agent. Filtre par pipeline, coche les lignes (Maj+clic pour une plage) puis attribue tout le lot d'un coup."
      search={query}
      onSearch={setQuery}
      searchPlaceholder="Filtrer par nom, ville, téléphone…"
      className="h-[36rem]"
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect value={pipelineId} onChange={setPipelineId} title="Pipeline">
            <option value="">Tous les pipelines ({searched.length})</option>
            {pipelineOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} ({pipelineCounts.counts.get(p.id) ?? 0})
              </option>
            ))}
            {(pipelineCounts.none > 0 || pipelineId === NO_PIPELINE) && (
              <option value={NO_PIPELINE}>Sans pipeline ({pipelineCounts.none})</option>
            )}
          </FilterSelect>

          {pipelineId && pipelineId !== NO_PIPELINE && stageOptions.length > 0 && (
            <FilterSelect value={stageId} onChange={setStageId} title="Étape du pipeline">
              <option value="">Toutes les étapes</option>
              {stageOptions.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.nom} ({stageCounts.get(s.id) ?? 0})
                </option>
              ))}
            </FilterSelect>
          )}

          <FilterSelect
            value={sort}
            onChange={(v) => setSort(v as "name" | "ville" | "pipeline")}
            title="Tri"
          >
            <option value="name">Trier par nom</option>
            <option value="ville">Trier par ville</option>
            <option value="pipeline">Trier par pipeline</option>
          </FilterSelect>
        </div>
      }
      banner={
        <BulkBar
          total={filtered.length}
          selectedCount={selected.size}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onClear={clear}
          busy={bulkBusy}
        >
          <Button size="sm" className="h-8" disabled={!canAssign || bulkBusy} onClick={assignSelected}>
            {bulkBusy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-1 h-4 w-4" />
            )}
            Attribuer {selected.size} à {agentName}
          </Button>
        </BulkBar>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyRow>
          {prospects.length === 0
            ? "Aucun prospect qualifié disponible dans le pool."
            : "Aucune entreprise ne correspond à ces filtres."}
        </EmptyRow>
      ) : (
        <>
          {truncated && (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Pool tronqué à {prospects.length} entreprises — affine la recherche pour voir le reste.
            </p>
          )}
          {filtered.map((e, i) => (
            <SelectableRow
              key={e.id}
              index={i}
              selected={selected.has(e.id)}
              disabled={busyId === e.id || bulkBusy}
              onToggle={toggle}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{e.name || "Sans nom"}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {e.ville && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {e.ville}
                      </span>
                    )}
                    {e.telephone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {e.telephone}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <DealBadges deals={e.deals} />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={busyId === e.id || bulkBusy || !canAssign}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void onAssign([e.id]);
                  }}
                >
                  Attribuer <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </SelectableRow>
          ))}
        </>
      )}
    </ListPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Entreprises de l'agent                                              */
/* ------------------------------------------------------------------ */

type ReadyFilter = "" | "ready" | "pending";

export function OwnedPanel({
  prospects,
  pipelines,
  loading,
  agentName,
  busyId,
  bulkBusy,
  onUnassign,
}: {
  prospects: AgentProspect[];
  pipelines: PipelineOption[];
  loading: boolean;
  agentName: string;
  busyId: number | null;
  bulkBusy: boolean;
  onUnassign: (ids: number[]) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [ready, setReady] = useState<ReadyFilter>("");

  const searched = useMemo(
    () => prospects.filter((p) => matches(query, p.name, p.ville)),
    [prospects, query],
  );

  const pipelineCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const p of searched) {
      const deals = p.deals ?? [];
      if (deals.length === 0) none++;
      for (const id of new Set(deals.map((d) => d.pipeline_id))) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return { counts, none };
  }, [searched]);

  const filtered = useMemo(
    () =>
      searched.filter((p) => {
        const deals = p.deals ?? [];
        if (pipelineId === NO_PIPELINE && deals.length > 0) return false;
        if (pipelineId && pipelineId !== NO_PIPELINE && !deals.some((d) => d.pipeline_id === pipelineId))
          return false;
        if (ready === "ready" && readySteps(p) < 4) return false;
        if (ready === "pending" && readySteps(p) === 4) return false;
        return true;
      }),
    [searched, pipelineId, ready],
  );

  const visibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const { selected, toggle, toggleAll, allSelected, clear } = useRowSelection(visibleIds);

  const readyCount = useMemo(() => searched.filter((p) => readySteps(p) === 4).length, [searched]);

  const unassignSelected = () => {
    const ids = visibleIds.filter((id) => selected.has(id));
    if (ids.length === 0) return;
    if (ids.length > MAX_BATCH) {
      window.alert(`Maximum ${MAX_BATCH} entreprises à la fois — affine le filtre.`);
      return;
    }
    if (
      !window.confirm(
        `Retirer ${ids.length} entreprise${ids.length > 1 ? "s" : ""} à ${agentName} ? Elles repartent dans le pool et leurs séquences en cours s'arrêtent.`,
      )
    ) {
      return;
    }
    void onUnassign(ids);
  };

  const pipelineOptions = pipelines.filter(
    (p) => (pipelineCounts.counts.get(p.id) ?? 0) > 0 || p.id === pipelineId,
  );

  return (
    <ListPanel
      title={`Entreprises de ${agentName}`}
      icon={<Building2 className="h-4 w-4" />}
      count={filtered.length}
      hint="Avec l'avancement des 4 étapes du marketing pipeline. Retirer les remet dans le pool."
      search={query}
      onSearch={setQuery}
      searchPlaceholder="Filtrer par nom, ville…"
      className="h-[36rem]"
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect value={pipelineId} onChange={setPipelineId} title="Pipeline">
            <option value="">Tous les pipelines ({searched.length})</option>
            {pipelineOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} ({pipelineCounts.counts.get(p.id) ?? 0})
              </option>
            ))}
            {(pipelineCounts.none > 0 || pipelineId === NO_PIPELINE) && (
              <option value={NO_PIPELINE}>Sans pipeline ({pipelineCounts.none})</option>
            )}
          </FilterSelect>

          <FilterSelect value={ready} onChange={(v) => setReady(v as ReadyFilter)} title="Avancement">
            <option value="">Tout avancement</option>
            <option value="ready">Prêtes à envoyer ({readyCount})</option>
            <option value="pending">En production ({searched.length - readyCount})</option>
          </FilterSelect>
        </div>
      }
      banner={
        <BulkBar
          total={filtered.length}
          selectedCount={selected.size}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onClear={clear}
          busy={bulkBusy}
        >
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-destructive hover:text-destructive"
            disabled={bulkBusy}
            onClick={unassignSelected}
          >
            {bulkBusy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeft className="mr-1 h-4 w-4" />
            )}
            Retirer {selected.size} de la liste
          </Button>
        </BulkBar>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyRow>
          {prospects.length === 0
            ? "Aucune entreprise attribuée à cet agent."
            : "Aucune entreprise ne correspond à ces filtres."}
        </EmptyRow>
      ) : (
        filtered.map((p, i) => (
          <SelectableRow
            key={p.id}
            index={i}
            selected={selected.has(p.id)}
            disabled={busyId === p.id || bulkBusy}
            onToggle={toggle}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{p.name || "Sans nom"}</span>
                </div>
                {p.ville && <div className="mt-0.5 text-xs text-muted-foreground">{p.ville}</div>}
                {(p.deals?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <DealBadges deals={p.deals ?? []} />
                  </div>
                )}
                <PipelineSteps p={p} />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-destructive hover:text-destructive"
                disabled={busyId === p.id || bulkBusy}
                onClick={(ev) => {
                  ev.stopPropagation();
                  void onUnassign([p.id]);
                }}
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Retirer
              </Button>
            </div>
            {(p.audit?.url || p.demo?.url) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {p.audit?.url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    asChild
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <a href={p.audit.url} target="_blank" rel="noreferrer">
                      <FileText className="mr-1 h-3.5 w-3.5" /> Audit
                    </a>
                  </Button>
                )}
                {p.demo?.url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    asChild
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <a href={p.demo.url} target="_blank" rel="noreferrer">
                      <Globe className="mr-1 h-3.5 w-3.5" /> Site démo
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            )}
          </SelectableRow>
        ))
      )}
    </ListPanel>
  );
}
