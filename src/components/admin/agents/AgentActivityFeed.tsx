"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Loader2,
  Check,
  EyeOff,
  Sparkles,
  ClipboardCheck,
  Globe,
  FileText,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/utils/authedFetch";
import { ListPanel, EmptyRow, formatCents } from "./shared";

/**
 * Ce qu'un agent a réellement fait : ses décisions de qualification et chaque
 * étape du marketing pipeline qu'il a jouée, plus la dépense d'enrichissement
 * qu'il a engagée face à son plafond.
 */

type ActivityEvent = {
  id: string;
  entreprise_id: number | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  entreprises: { id: number; name: string | null; ville: string | null } | null;
};

type Spend = {
  period: "month" | "total";
  period_cents: number;
  total_cents: number;
  budget_cents: number | null;
};

const ACTION_META: Record<string, { label: string; icon: LucideIcon }> = {
  qualify: { label: "A qualifié", icon: Check },
  skip: { label: "A écarté", icon: EyeOff },
  enrich: { label: "A lancé l'enrichissement", icon: Sparkles },
  validate_enrich: { label: "A validé les données", icon: ClipboardCheck },
  create_site: { label: "A créé le site démo", icon: Globe },
  validate_site: { label: "A validé le site démo", icon: Globe },
  create_audit: { label: "A créé l'audit", icon: FileText },
  validate_audit: { label: "A validé l'audit", icon: FileText },
};

export default function AgentActivityFeed({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [spend, setSpend] = useState<Spend | null>(null);
  const [migrationApplied, setMigrationApplied] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!agentId) {
      setEvents([]);
      setSpend(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/admin/agent-activity?agent_id=${agentId}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        events: ActivityEvent[];
        spend: Spend;
        migration_applied: boolean;
      };
      setEvents(data.events ?? []);
      setSpend(data.spend ?? null);
      setMigrationApplied(data.migration_applied !== false);
    } catch {
      setEvents([]);
      setSpend(null);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const overBudget =
    spend?.budget_cents != null && spend.period_cents >= spend.budget_cents && spend.budget_cents > 0;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Activity className="h-4 w-4" /> Activité de l&apos;agent
      </h2>

      {spend && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Wallet className="h-4 w-4 text-muted-foreground" /> Dépense d&apos;enrichissement
            </span>
            <span className="text-muted-foreground">
              {spend.period === "month" ? "Ce mois" : "Total"} :{" "}
              <strong className={overBudget ? "text-destructive" : "text-foreground"}>
                {formatCents(spend.period_cents)}
              </strong>
              {spend.budget_cents != null && <> / {formatCents(spend.budget_cents)}</>}
            </span>
            <span className="text-muted-foreground">
              Cumul depuis le début : {formatCents(spend.total_cents)}
            </span>
            {spend.budget_cents == null && <Badge variant="secondary">Pas de plafond</Badge>}
            {overBudget && <Badge variant="destructive">Plafond atteint</Badge>}
          </CardContent>
        </Card>
      )}

      {!migrationApplied ? (
        <Card>
          <CardContent className="py-6 text-sm text-amber-600 dark:text-amber-500">
            La migration <code>20260727_agent_qualification_and_pipeline.sql</code> n&apos;est pas
            encore appliquée : aucune activité n&apos;est journalisée.
          </CardContent>
        </Card>
      ) : (
        <ListPanel
          title="Journal des actions"
          icon={<Activity className="h-4 w-4" />}
          count={events.length}
          hint="Les 150 dernières actions, de la plus récente à la plus ancienne."
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : events.length === 0 ? (
            <EmptyRow>Cet agent n&apos;a encore rien fait.</EmptyRow>
          ) : (
            events.map((e) => {
              const meta = ACTION_META[e.action] ?? { label: e.action, icon: Activity };
              const Icon = meta.icon;
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate text-sm">
                        {meta.label}{" "}
                        <span className="font-medium">
                          {e.entreprises?.name || `entreprise #${e.entreprise_id ?? "?"}`}
                        </span>
                      </div>
                      {e.entreprises?.ville && (
                        <div className="text-xs text-muted-foreground">{e.entreprises.ville}</div>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })
          )}
        </ListPanel>
      )}
    </section>
  );
}
