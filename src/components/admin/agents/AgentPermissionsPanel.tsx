"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Save, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/utils/authedFetch";
import { formatCents } from "./shared";

/**
 * Ce que l'admin ouvre à un agent : la qualification (pré-tri du pool commun) et
 * le marketing pipeline sur ses entreprises attribuées, plus le plafond de
 * dépense d'enrichissement — la seule étape du pipeline qui coûte de l'argent.
 *
 * Défaut = refus : un agent sans réglage n'a accès à rien de tout ça.
 */

type SettingsRow = {
  agent_id: string;
  can_qualify: boolean;
  can_use_marketing_pipeline: boolean;
  enrichment_budget_cents: number | null;
  budget_period: "month" | "total";
};

type Spend = Record<string, { period_cents: number; total_cents: number }>;

export default function AgentPermissionsPanel({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [settings, setSettings] = useState<SettingsRow[]>([]);
  const [spend, setSpend] = useState<Spend>({});
  const [migrationApplied, setMigrationApplied] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Le budget est saisi en euros, stocké en centimes. Chaîne vide = pas de plafond.
  const [budgetEuros, setBudgetEuros] = useState("");
  const [period, setPeriod] = useState<"month" | "total">("month");
  const [canQualify, setCanQualify] = useState(false);
  const [canPipeline, setCanPipeline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/admin/agent-settings");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        settings: SettingsRow[];
        spend: Spend;
        migration_applied: boolean;
      };
      setSettings(data.settings ?? []);
      setSpend(data.spend ?? {});
      setMigrationApplied(data.migration_applied !== false);
    } catch {
      toast.error("Impossible de charger les permissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(
    () => settings.find((s) => s.agent_id === agentId) ?? null,
    [settings, agentId],
  );

  // Recharge le formulaire quand on change d'agent ou que les données arrivent.
  useEffect(() => {
    setCanQualify(current?.can_qualify === true);
    setCanPipeline(current?.can_use_marketing_pipeline === true);
    setPeriod(current?.budget_period === "total" ? "total" : "month");
    setBudgetEuros(
      current?.enrichment_budget_cents == null
        ? ""
        : (current.enrichment_budget_cents / 100).toFixed(2),
    );
  }, [current]);

  const save = async () => {
    if (!agentId) return;
    setSaving(true);
    try {
      const trimmed = budgetEuros.trim();
      const res = await authedFetch("/api/admin/agent-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          can_qualify: canQualify,
          can_use_marketing_pipeline: canPipeline,
          enrichment_budget_cents:
            trimmed === "" ? null : Math.max(0, Math.round((Number(trimmed) || 0) * 100)),
          budget_period: period,
        }),
      });
      if (res.status === 503) {
        toast.error("Migration non appliquée en base — les permissions ne peuvent pas être enregistrées.");
        return;
      }
      if (!res.ok) throw new Error();
      toast.success("Permissions enregistrées.");
      await load();
    } catch {
      toast.error("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const agentSpend = spend[agentId];

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="h-4 w-4" /> Permissions de {agentName}
      </h2>

      {!migrationApplied && (
        <Card>
          <CardContent className="py-4 text-sm text-amber-600 dark:text-amber-500">
            La migration <code>20260727_agent_qualification_and_pipeline.sql</code> n&apos;est pas
            encore appliquée. Les permissions sont affichées à leur valeur par défaut (aucun accès)
            et ne peuvent pas être enregistrées.
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="cap-qualify" className="text-sm font-medium">
                  Qualification d&apos;entreprises
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Donne accès à la file du pool commun. L&apos;agent ne peut que{" "}
                  <strong>qualifier</strong> ou <strong>masquer</strong> — jamais blacklister ni
                  supprimer. Ses décisions arrivent ici en attente de ta validation.
                </p>
              </div>
              <Switch id="cap-qualify" checked={canQualify} onCheckedChange={setCanQualify} />
            </div>

            <div className="flex items-start justify-between gap-4 border-t pt-4">
              <div>
                <Label htmlFor="cap-pipeline" className="text-sm font-medium">
                  Marketing pipeline
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Donne accès au tableau d&apos;avancement, restreint à ses entreprises attribuées,
                  avec les 4 étapes de production (enrichissement, validation des données, site
                  démo, audit). La colonne Attribution n&apos;y figure pas.
                </p>
              </div>
              <Switch id="cap-pipeline" checked={canPipeline} onCheckedChange={setCanPipeline} />
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Wallet className="h-4 w-4" /> Plafond de dépense d&apos;enrichissement
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetEuros}
                  onChange={(e) => setBudgetEuros(e.target.value)}
                  placeholder="Illimité"
                  className="h-9 max-w-[9rem]"
                />
                <span className="text-sm text-muted-foreground">€ par</span>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as "month" | "total")}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="month">mois</option>
                  <option value="total">au total</option>
                </select>
                {agentSpend && (
                  <Badge variant="secondary" className="ml-1">
                    Dépensé : {formatCents(agentSpend.period_cents)}
                    {period === "month" ? " ce mois" : ""} · {formatCents(agentSpend.total_cents)} au
                    total
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Laisse vide pour ne pas plafonner. Seul l&apos;enrichissement consomme du budget —
                le site démo est un clone et l&apos;audit un document généré localement. Le coût
                d&apos;un enrichissement se règle dans Paramètres › Modèle IA de
                l&apos;enrichissement.
              </p>
            </div>

            <Button onClick={save} disabled={saving || !agentId} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer les permissions
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
