"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  Phone,
  Check,
  Ban,
  EyeOff,
  Undo2,
  Trash2,
  ExternalLink,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/utils/authedFetch";
import { useAppData } from "@/components/AppDataContext";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { ListPanel, EmptyRow, one, agentLabel, matches, type Agent } from "./shared";

/**
 * Revue du pré-tri des agents.
 *
 * Une décision d'agent ne touche pas `entreprises` : elle attend ici. L'admin
 * tranche, et c'est ce verdict qui produit l'effet réel.
 *
 * L'effet est appliqué par les fonctions existantes d'`AppDataContext`
 * (`qualifyCompany` avec son opportunité auto, `blacklistCompany`/`Domain`,
 * `updateCompany`, `deleteCompany`) plutôt que réimplémenté côté serveur : la
 * qualification embarque l'offre active, le pipeline par défaut, l'étape
 * d'ordre 1 et la priorité selon le mobile — dupliquer tout ça garantirait une
 * divergence. La route `/api/admin/agent-review` ne fait qu'enregistrer le
 * verdict, une fois l'effet appliqué.
 */

type ReviewDecision = {
  id: string;
  entreprise_id: number;
  agent_id: string;
  decision: "qualify" | "skip";
  note: string | null;
  created_at: string;
  entreprises: {
    id: number;
    name: string | null;
    ville: string | null;
    code_postal: string | null;
    telephone: string | null;
    email: string | null;
    canonical_url: string | null;
    site_web_canonique: string | null;
  } | null;
  user_profiles: Agent | Agent[] | null;
};

type ReviewAction = "qualify" | "blacklist" | "hide" | "requeue" | "delete";

export default function AgentQualificationReview({
  agentId,
  agents,
  onChanged,
}: {
  agentId: string;
  agents: Agent[];
  onChanged?: () => void;
}) {
  const { qualifyCompany, blacklistCompany, blacklistDomain, updateCompany, deleteCompany } =
    useAppData();

  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  const [scope, setScope] = useState<"agent" | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [migrationApplied, setMigrationApplied] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        scope === "agent" && agentId
          ? `/api/admin/agent-review?agent_id=${agentId}`
          : "/api/admin/agent-review";
      const res = await authedFetch(url);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        decisions: ReviewDecision[];
        migration_applied: boolean;
      };
      setDecisions(data.decisions ?? []);
      setMigrationApplied(data.migration_applied !== false);
    } catch {
      toast.error("Impossible de charger les décisions à valider.");
    } finally {
      setLoading(false);
    }
  }, [scope, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const filtered = useMemo(
    () =>
      decisions.filter((d) =>
        matches(query, d.entreprises?.name, d.entreprises?.ville, d.entreprises?.telephone),
      ),
    [decisions, query],
  );

  /** Applique l'effet métier réel, puis clôt la décision. */
  const decide = async (d: ReviewDecision, action: ReviewAction) => {
    const entId = d.entreprise_id;
    const label =
      getCompanyDisplayName(d.entreprises?.name ?? null, d.entreprises?.canonical_url ?? null) ||
      "Entreprise";
    setBusy(d.id);
    try {
      switch (action) {
        case "qualify":
          await qualifyCompany(entId);
          break;
        case "blacklist": {
          const url = d.entreprises?.canonical_url || d.entreprises?.site_web_canonique;
          if (url) await blacklistDomain(url, "Écartée à la revue du pré-tri agent");
          else await blacklistCompany(entId, "Écartée à la revue du pré-tri agent");
          break;
        }
        case "hide":
          await updateCompany(entId, { hidden_in_qualification: true });
          break;
        case "requeue":
          // Rien à appliquer : clore la décision suffit à la remettre en file.
          break;
        case "delete":
          await deleteCompany(entId);
          break;
      }

      const res = await authedFetch("/api/admin/agent-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision_id: d.id, action }),
      });
      if (!res.ok) {
        toast.error(
          "Action appliquée, mais la décision n'a pas pu être clôturée — réessaie de la traiter.",
        );
      } else {
        toast.success(`${label} : ${ACTION_LABEL[action]}.`);
      }

      setDecisions((cur) => cur.filter((x) => x.id !== d.id));
      onChanged?.();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusy(null);
    }
  };

  if (!migrationApplied) {
    return (
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="h-4 w-4" /> Pré-tri des agents
        </h2>
        <Card>
          <CardContent className="py-6 text-sm text-amber-600 dark:text-amber-500">
            La migration <code>20260727_agent_qualification_and_pipeline.sql</code> n&apos;est pas
            encore appliquée : la qualification déléguée est inactive.
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="h-4 w-4" /> Pré-tri des agents à valider
        </h2>
        <p className="text-sm text-muted-foreground">
          Ce que les agents ont qualifié ou écarté. Rien n&apos;est appliqué tant que tu n&apos;as
          pas tranché : valider qualifie réellement l&apos;entreprise et crée son opportunité, et tu
          restes libre de blacklister, masquer, remettre en file ou supprimer.
        </p>
      </div>

      <ListPanel
        title="En attente de validation"
        icon={<ClipboardCheck className="h-4 w-4" />}
        count={filtered.length}
        hint="Le badge indique ce que l'agent a proposé. Ton choix peut en différer."
        search={query}
        onSearch={setQuery}
        searchPlaceholder="Filtrer par nom, ville, téléphone…"
        actions={
          <div className="flex shrink-0 gap-1 rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                scope === "all" ? "bg-muted font-medium" : "text-muted-foreground"
              }`}
            >
              Tous les agents
            </button>
            <button
              type="button"
              onClick={() => setScope("agent")}
              disabled={!agentId}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                scope === "agent" ? "bg-muted font-medium" : "text-muted-foreground"
              }`}
            >
              Agent sélectionné
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyRow>
            {decisions.length === 0
              ? "Aucune décision d'agent en attente."
              : "Aucune entreprise ne correspond à ce filtre."}
          </EmptyRow>
        ) : (
          filtered.map((d) => {
            const ent = d.entreprises;
            const agent = one(d.user_profiles) ?? agentById.get(d.agent_id) ?? null;
            const url = ent?.canonical_url || ent?.site_web_canonique;
            const disabled = busy === d.id;

            return (
              <div key={d.id} className="rounded-lg border bg-background px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{ent?.name || "Sans nom"}</span>
                      <Badge
                        variant={d.decision === "qualify" ? "default" : "secondary"}
                        className="ml-1 shrink-0"
                      >
                        {d.decision === "qualify" ? "Qualifiée par l'agent" : "Écartée par l'agent"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>
                        {agentLabel(agent)} · {new Date(d.created_at).toLocaleDateString("fr-FR")}
                      </span>
                      {ent?.ville && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {ent.ville}
                        </span>
                      )}
                      {ent?.telephone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {ent.telephone}
                        </span>
                      )}
                    </div>
                  </div>
                  {url && (
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" asChild>
                      <a
                        href={/^https?:\/\//i.test(url) ? url : `https://${url}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Site <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>

                {d.note && <p className="mt-1.5 text-xs italic text-muted-foreground">{d.note}</p>}

                <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
                  <Button size="sm" disabled={disabled} onClick={() => decide(d, "qualify")}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Qualifier
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => decide(d, "hide")}
                  >
                    <EyeOff className="mr-1 h-3.5 w-3.5" /> Masquer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => decide(d, "requeue")}
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Remettre en file
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={() => decide(d, "blacklist")}
                  >
                    <Ban className="mr-1 h-3.5 w-3.5" /> Blacklister
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Supprimer définitivement ${ent?.name || "cette entreprise"} ? Ses contacts et opportunités seront supprimés.`,
                        )
                      ) {
                        void decide(d, "delete");
                      }
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </ListPanel>
    </section>
  );
}

const ACTION_LABEL: Record<ReviewAction, string> = {
  qualify: "qualifiée",
  blacklist: "blacklistée",
  hide: "masquée",
  requeue: "remise en file",
  delete: "supprimée",
};
