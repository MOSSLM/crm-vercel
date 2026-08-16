"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Filter, RefreshCw, TrendingDown } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EntonnoirEtages from "@/components/agent-portal/entonnoir/EntonnoirEtages";
import EntonnoirParAge from "@/components/agent-portal/entonnoir/EntonnoirParAge";
import SelecteurCohorte from "@/components/agent-portal/entonnoir/SelecteurCohorte";
import { nombre, pourcentage } from "@/components/agent-portal/entonnoir/vue";
import { ETAGE_PAR_CLE, type Cohorte, type Etage, type ReponseEntonnoir } from "@/lib/entonnoir/etages";

/**
 * L'entonnoir de la campagne d'août.
 *
 * C'EST UN TABLEAU DE BORD : ON LE SCANNE
 * L'ordre de la page est celui des questions qu'on se pose devant, pas celui
 * des données : d'abord OÙ ÇA FUIT (le bandeau), ensuite l'entonnoir complet,
 * enfin la comparaison des deux cohortes au même âge — celle qui tranchera le
 * 25 août entre « vendre à ceux qui ont un site faible » et « vendre à ceux qui
 * n'ont rien ».
 */

/** La plus grosse fuite de l'entonnoir : ce qu'on cherche en ouvrant la page. */
function plusGrossePerte(etages: Etage[]): Etage | null {
  let pire: Etage | null = null;
  for (const e of etages) {
    if (e.perte == null || e.perte <= 0) continue;
    if (!pire || e.perte > (pire.perte ?? 0)) pire = e;
  }
  return pire;
}

export default function AgentEntonnoirPage() {
  const [cohorte, setCohorte] = useState<Cohorte | null>(null);
  const [data, setData] = useState<ReponseEntonnoir | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (filtre: Cohorte | null) => {
    setChargement(true);
    setErreur(null);
    try {
      const qs = filtre ? `?cohorte=${encodeURIComponent(filtre)}` : "";
      const res = await authedFetch(`/api/agent/entonnoir${qs}`);
      if (!res.ok) {
        setErreur("Impossible de charger l'entonnoir.");
        return;
      }
      setData((await res.json()) as ReponseEntonnoir);
    } catch {
      setErreur("Impossible de charger l'entonnoir.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger(cohorte);
  }, [charger, cohorte]);

  const pire = data ? plusGrossePerte(data.etages) : null;
  const ciblees = data?.etages.find((e) => e.cle === "ciblee")?.total ?? 0;
  const payees = data?.etages.find((e) => e.cle === "payee")?.total ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Entonnoir</h1>
          <p className="text-sm text-muted-foreground">
            Où passent les entreprises de la campagne, et surtout où on les perd.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-xs text-[var(--text-3)]">
              Mesuré le{" "}
              {new Date(data.mesureLe).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void charger(cohorte)}
            disabled={chargement}
            aria-label="Recalculer"
          >
            <RefreshCw className={`h-4 w-4 ${chargement ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {data && (
        <SelecteurCohorte valeur={cohorte} effectifs={data.effectifs} onChange={setCohorte} />
      )}

      {erreur && <div className="text-sm text-destructive">{erreur}</div>}
      {chargement && !data && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {/* Une campagne pas encore posée en base ne doit pas ressembler à une
          campagne sans résultat : on dit ce qui manque. */}
      {data?.indisponible && (
        <Card style={{ borderColor: "var(--warn)" }}>
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} />
            <div>
              <div className="font-medium">Entonnoir non mesurable</div>
              <div className="text-[var(--text-2)]">{data.indisponible}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {data && !data.indisponible && (
        <>
          {/* ── Ce qui décide, en haut et en gros ───────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="sm:col-span-2" style={pire ? { borderColor: "var(--danger)" } : undefined}>
              <CardContent className="flex items-center gap-4 py-4">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--danger-tint)", color: "var(--danger)" }}
                >
                  <TrendingDown className="h-5 w-5" />
                </div>
                {pire ? (
                  <div className="min-w-0">
                    <div className="text-xl font-semibold leading-tight" style={{ color: "var(--danger)" }}>
                      −{nombre(pire.perte)} entreprises · {pourcentage(pire.pertePct)}
                    </div>
                    <div className="truncate text-sm text-[var(--text-2)]">
                      La plus grosse perte :{" "}
                      {pire.depuis ? `${ETAGE_PAR_CLE[pire.depuis].libelle} → ` : ""}
                      {pire.libelle}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Aucune perte mesurée pour l&apos;instant.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div>
                  <div className="text-xl font-semibold leading-tight tabular-nums">
                    {nombre(payees)} / {nombre(ciblees)}
                  </div>
                  <div className="text-xs text-muted-foreground">Payées sur ciblées</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium tabular-nums" style={{ color: "var(--ok)" }}>
                    {pourcentage(data.etages.find((e) => e.cle === "payee")?.part ?? null)}
                  </div>
                  <div className="text-[11px] text-[var(--text-3)]">
                    sortie : {nombre(data.sortie.perdu)} perdues · {nombre(data.sortie.nurturing)} en
                    nurturing
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Les huit étages ─────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Les huit étages</CardTitle>
            </CardHeader>
            <CardContent>
              <EntonnoirEtages etages={data.etages} />
            </CardContent>
          </Card>

          {/* ── La comparaison au même âge ──────────────────────────────── */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4 text-[var(--text-3)]" />
                Au même âge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EntonnoirParAge parAge={data.parAge} nonDatees={data.nonDatees} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
