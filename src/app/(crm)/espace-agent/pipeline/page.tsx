"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, User } from "lucide-react";
import { formatPrice, one, stageTint } from "@/components/agent-portal/format";

type Stage = { id: number; nom: string; ordre: number };
type PipelineBoard = { pipelineId: string; nom: string; ordre: number; stages: Stage[] };
type Entreprise = { id: number; name: string | null; ville: string | null };
type Contact = { first_name: string | null; last_name: string | null };
type Opp = {
  id: string;
  name: string | null;
  stage_id: number | null;
  pipeline_id: string | null;
  montant: number | null;
  priorite: string | null;
  entreprise: Entreprise | Entreprise[] | null;
  contact: Contact | Contact[] | null;
};

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  haute: "default",
  moyenne: "secondary",
  basse: "outline",
};

/**
 * Kanban de l'agent, GROUPÉ PAR PIPELINE.
 *
 * Une affaire attribuée reste dans son pipeline d'origine (« Streak Mars/Avril »,
 * pipeline par défaut, « Agent SAMA » pour les prospects vierges…). Une seule
 * rangée de colonnes ne peut donc plus les accueillir : les libellés d'étapes se
 * répètent d'un pipeline à l'autre, et une carte dont l'étape n'appartient à
 * aucune colonne affichée disparaîtrait sans un mot.
 *
 * Le glisser-déposer est cloisonné par pipeline : déposer une carte sur une
 * colonne d'un autre pipeline déplacerait l'affaire (le trigger
 * `sync_opportunity_pipeline_from_stage` dérive `pipeline_id` de l'étape), ce
 * que le serveur refuse désormais avec `etape_hors_pipeline`.
 */
export default function AgentPipelinePage() {
  const [pipelines, setPipelines] = useState<PipelineBoard[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; pipelineId: string | null } | null>(null);
  const [overStage, setOverStage] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authedFetch("/api/agent/pipeline");
        if (!res.ok) {
          setError("Impossible de charger le pipeline.");
          return;
        }
        const data = await res.json();
        setPipelines(data.pipelines ?? []);
        setOpps(data.opportunities ?? []);
      } catch {
        setError("Impossible de charger le pipeline.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const move = async (oppId: string, stageId: number) => {
    const current = opps.find((o) => o.id === oppId);
    if (!current || current.stage_id === stageId) return;
    const prev = opps;
    setOpps((os) => os.map((o) => (o.id === oppId ? { ...o, stage_id: stageId } : o)));
    try {
      const res = await authedFetch(`/api/agent/opportunites/${oppId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Étape mise à jour.");
    } catch {
      setOpps(prev);
      toast.error("Déplacement impossible.");
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">{error}</div>;

  // Étapes connues, tous pipelines confondus : sert à repérer les affaires dont
  // l'étape ne correspond à aucune colonne (étape masquée, ou pipeline sans
  // étape visible). Elles sont montrées à part plutôt que perdues.
  const knownStageIds = new Set(pipelines.flatMap((p) => p.stages.map((s) => s.id)));
  const orphans = opps.filter((o) => o.stage_id == null || !knownStageIds.has(o.stage_id));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-6 pb-3">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Glisse une carte pour faire avancer un prospect, à l&apos;intérieur de son pipeline.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/espace-agent/entreprises">Réclamer un prospect</Link>
        </Button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6">
        {pipelines.length === 0 && orphans.length === 0 && (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Aucun prospect attribué pour l&apos;instant.
          </div>
        )}

        {pipelines.map((pipeline) => {
          const inPipeline = opps.filter((o) => o.pipeline_id === pipeline.pipelineId);
          return (
            <section key={pipeline.pipelineId}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold">{pipeline.nom}</h2>
                <span className="text-xs text-muted-foreground">
                  {inPipeline.length} affaire{inPipeline.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="overflow-x-auto">
                <div className="flex gap-3" style={{ minWidth: "min-content" }}>
                  {pipeline.stages.map((stage) => {
                    const cards = inPipeline.filter((o) => o.stage_id === stage.id);
                    const total = cards.reduce((sum, c) => sum + Number(c.montant ?? 0), 0);
                    // Une carte ne peut être déposée que dans son propre pipeline.
                    const droppable = drag != null && drag.pipelineId === pipeline.pipelineId;
                    const isOver = overStage === stage.id && droppable;
                    return (
                      <div
                        key={stage.id}
                        onDragOver={(e) => {
                          if (!droppable) return;
                          e.preventDefault();
                          setOverStage(stage.id);
                        }}
                        onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                        onDrop={(e) => {
                          e.preventDefault();
                          setOverStage(null);
                          if (!droppable || !drag) return;
                          void move(drag.id, stage.id);
                        }}
                        className={`flex max-h-[28rem] w-72 shrink-0 flex-col rounded-lg border bg-[var(--surface-2)] ${
                          isOver ? "ring-2 ring-primary/40" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between border-b px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: stageTint(stage.nom) }}
                            />
                            <span className="text-sm font-medium">{stage.nom}</span>
                            <span className="text-xs text-muted-foreground">{cards.length}</span>
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatPrice(total)}
                          </span>
                        </div>

                        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                          {cards.map((o) => (
                            <OppCard
                              key={o.id}
                              opp={o}
                              onDragStart={() => setDrag({ id: o.id, pipelineId: o.pipeline_id })}
                              onDragEnd={() => setDrag(null)}
                            />
                          ))}
                          {cards.length === 0 && (
                            <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                              Vide
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}

        {orphans.length > 0 && (
          <section>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">Sans étape</h2>
              <span className="text-xs text-muted-foreground">
                {orphans.length} affaire{orphans.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-2">
              {orphans.map((o) => (
                <OppCard key={o.id} opp={o} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function OppCard({
  opp,
  onDragStart,
  onDragEnd,
}: {
  opp: Opp;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const ent = one(opp.entreprise);
  const contact = one(opp.contact);
  const contactName = contact
    ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
    : "";
  const draggable = onDragStart != null;
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-md border bg-card p-3 shadow-sm ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="line-clamp-1">{ent?.name || opp.name || "Prospect"}</span>
        </div>
        {opp.priorite && (
          <Badge
            variant={PRIORITY_VARIANT[opp.priorite] ?? "outline"}
            className="shrink-0 text-[10px] capitalize"
          >
            {opp.priorite}
          </Badge>
        )}
      </div>
      {ent?.ville && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" /> {ent.ville}
        </div>
      )}
      {contactName && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" /> {contactName}
        </div>
      )}
      <div className="mt-2 text-sm font-semibold">{formatPrice(opp.montant)}</div>
    </div>
  );
}
