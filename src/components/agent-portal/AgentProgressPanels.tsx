"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, GitBranch, Flame } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MARKETING_STAGES,
  type AgentProgress,
  type MarketingProgress,
  type QualificationProgress,
} from "@/lib/agent-progress";

/**
 * Compteurs de progression du dashboard agent.
 *
 * Une carte par capacité déléguée, et seulement si elle est accordée : un agent
 * qui ne fait que du démarchage ne voit ni l'une ni l'autre, et le dashboard
 * reste tel qu'il était. C'est le serveur qui tranche — `/api/agent/progress`
 * renvoie `null` pour une capacité refusée, on n'affiche donc jamais une carte
 * vide « au cas où ».
 *
 * Ces chiffres sont là pour donner de l'élan : ce qui a été fait aujourd'hui et
 * cette semaine passe avant les totaux, et chaque carte se termine par le lien
 * vers l'écran qui permet d'avancer.
 */
export default function AgentProgressPanels() {
  const [data, setData] = useState<AgentProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await authedFetch("/api/agent/progress");
        if (!res.ok) return;
        const payload = (await res.json()) as AgentProgress;
        if (!cancelled) setData(payload);
      } catch {
        // Compteur d'encouragement : son absence ne doit rien casser à l'écran.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const qualification = data?.qualification ?? null;
  const marketing = data?.marketing_pipeline ?? null;
  if (!qualification && !marketing) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {qualification && <QualificationCard data={qualification} />}
      {marketing && <MarketingCard data={marketing} />}
    </div>
  );
}

/* ── Qualification ──────────────────────────────────────────────────────── */

function QualificationCard({ data }: { data: QualificationProgress }) {
  const { traitees, qualifiees, masquees } = data;
  const qualifieesPct = traitees > 0 ? (qualifiees / traitees) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          Ma qualification
        </CardTitle>
        <Streak today={data.aujourdhui} week={data.semaine} />
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <span className="text-3xl font-semibold leading-none tabular-nums">{traitees}</span>
          <span className="pb-0.5 text-sm text-muted-foreground">
            entreprise{traitees > 1 ? "s" : ""} triée{traitees > 1 ? "s" : ""} au total
          </span>
        </div>

        {traitees > 0 && (
          <div className="space-y-2">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${qualifieesPct}%`, background: "var(--ok)" }} />
              <div style={{ width: `${100 - qualifieesPct}%`, background: "var(--text-3)" }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Legend color="var(--ok)" label="Qualifiées" value={qualifiees} />
              <Legend color="var(--text-3)" label="Masquées" value={masquees} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <Stat
            label="Validées par l'admin"
            value={data.validees}
            hint={data.precision != null ? `${data.precision} % de mes décisions revues` : undefined}
            tone="ok"
          />
          <Stat label="En attente de revue" value={data.en_attente} tone="warn" />
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Environ <span className="font-medium text-foreground">{data.file_restante}</span>{" "}
            entreprise{data.file_restante > 1 ? "s" : ""} encore dans la file.
          </p>
          <Button asChild size="sm" variant="ghost">
            <Link href="/espace-agent/qualification">
              Qualifier <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Marketing pipeline ─────────────────────────────────────────────────── */

function MarketingCard({ data }: { data: MarketingProgress }) {
  const { total, terminees, pourcentage } = data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          Marketing pipeline
        </CardTitle>
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--ok)" }}>
          {pourcentage} %
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune entreprise ne t&apos;est encore attribuée sur le pipeline marketing.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pourcentage}%`, background: "var(--ok)" }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{data.etapes_faites}</span> étapes
                franchies sur {data.etapes_total}.
              </p>
            </div>

            <div className="flex items-end gap-2">
              <span className="text-3xl font-semibold leading-none tabular-nums">{terminees}</span>
              <span className="pb-0.5 text-sm text-muted-foreground">
                entreprise{terminees > 1 ? "s" : ""} au bout du pipeline sur {total}
              </span>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              {MARKETING_STAGES.map((stage) => (
                <div key={stage.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: stage.color }}
                  />
                  <span className="flex-1 text-muted-foreground">{stage.label}</span>
                  <span className="tabular-nums">{data.par_etape[stage.id]}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end border-t pt-3">
          <Button asChild size="sm" variant="ghost">
            <Link href="/espace-agent/marketing-pipeline">
              Ouvrir le pipeline <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Briques partagées ──────────────────────────────────────────────────── */

/** Ce qui a été fait aujourd'hui, avec la semaine en second plan. */
function Streak({ today, week }: { today: number; week: number }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: today > 0 ? "var(--ok-tint)" : "var(--muted)",
        color: today > 0 ? "var(--ok)" : "var(--text-3)",
      }}
      title={`${week} cette semaine`}
    >
      <Flame className="h-3.5 w-3.5" />
      <span className="tabular-nums">{today} aujourd&apos;hui</span>
      <span className="opacity-70">· {week} cette semaine</span>
    </span>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label} <span className="font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone: "ok" | "warn";
}) {
  return (
    <div>
      <div
        className="text-xl font-semibold leading-tight tabular-nums"
        style={{ color: value > 0 ? `var(--${tone})` : undefined }}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}
