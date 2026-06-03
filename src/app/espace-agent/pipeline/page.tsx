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
type Entreprise = { id: number; name: string | null; ville: string | null };
type Contact = { first_name: string | null; last_name: string | null };
type Opp = {
  id: string;
  name: string | null;
  stage_id: number | null;
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

export default function AgentPipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
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
        setStages(data.stages ?? []);
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-6 pb-3">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Glisse une carte pour faire avancer un prospect.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/espace-agent/entreprises">Réclamer un prospect</Link>
        </Button>
      </div>

      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex h-full gap-3" style={{ minWidth: "min-content" }}>
          {stages.map((stage) => {
            const cards = opps.filter((o) => o.stage_id === stage.id);
            const total = cards.reduce((sum, c) => sum + Number(c.montant ?? 0), 0);
            const isOver = overStage === stage.id;
            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  if (dragId) void move(dragId, stage.id);
                }}
                className={`flex w-72 shrink-0 flex-col rounded-lg border bg-[var(--surface-2)] ${
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
                  {cards.map((o) => {
                    const ent = one(o.entreprise);
                    const contact = one(o.contact);
                    const contactName = contact
                      ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
                      : "";
                    return (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={() => setDragId(o.id)}
                        onDragEnd={() => setDragId(null)}
                        className="cursor-grab rounded-md border bg-card p-3 shadow-sm active:cursor-grabbing"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="line-clamp-1">
                              {ent?.name || o.name || "Prospect"}
                            </span>
                          </div>
                          {o.priorite && (
                            <Badge
                              variant={PRIORITY_VARIANT[o.priorite] ?? "outline"}
                              className="shrink-0 text-[10px] capitalize"
                            >
                              {o.priorite}
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
                        <div className="mt-2 text-sm font-semibold">
                          {formatPrice(o.montant)}
                        </div>
                      </div>
                    );
                  })}
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
    </div>
  );
}
