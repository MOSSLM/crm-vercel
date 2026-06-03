"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { useAuth } from "@/components/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Trophy, Layers, Inbox, Target, ArrowRight } from "lucide-react";
import { formatPrice, stageTint } from "@/components/agent-portal/format";

type DashboardData = {
  total: number;
  actifs: number;
  rdv: number;
  signes: number;
  perdus: number;
  pipelineValue: number;
  byStage: Record<string, number>;
  stages: { id: number; nom: string; ordre: number }[];
  poolDisponible: number;
  tachesEnAttente: number;
};

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-primary"
          style={{ background: "var(--accent-tint)" }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xl font-semibold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authedFetch("/api/agent/dashboard");
        if (!res.ok) {
          setError("Impossible de charger le tableau de bord.");
          return;
        }
        setData((await res.json()) as DashboardData);
      } catch {
        setError("Impossible de charger le tableau de bord.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const displayName = user?.name?.trim().split(" ")[0] || "agent";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Bonjour, {displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;état de ton démarchage CVC pour SAMA.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}
      {error && <div className="text-sm text-destructive">{error}</div>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="RDV calés" value={data.rdv} icon={CalendarCheck} />
            <Kpi label="Pipeline actif" value={data.actifs} icon={Layers} />
            <Kpi label="Clients signés" value={data.signes} icon={Trophy} />
            <Kpi label="Tâches à traiter" value={data.tachesEnAttente} icon={Inbox} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mon pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.stages.map((s) => {
                  const count = data.byStage[s.nom] ?? 0;
                  const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
                  return (
                    <div key={s.id} className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: stageTint(s.nom) }}
                      />
                      <span className="w-28 shrink-0 text-sm">{s.nom}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: stageTint(s.nom) }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm tabular-nums">{count}</span>
                    </div>
                  );
                })}
                <div className="pt-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/espace-agent/pipeline">
                      Ouvrir le pipeline <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Valeur du pipeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{formatPrice(data.pipelineValue)}</div>
                  <p className="text-xs text-muted-foreground">Opportunités en cours</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Prospects à réclamer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-2xl font-semibold">{data.poolDisponible}</div>
                  <p className="text-xs text-muted-foreground">
                    Entreprises CVC qualifiées dans le pool commun.
                  </p>
                  <Button asChild size="sm" className="w-full">
                    <Link href="/espace-agent/entreprises">
                      <Target className="mr-1 h-4 w-4" /> Démarcher
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
