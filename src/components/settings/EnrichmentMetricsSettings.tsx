"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authedFetch } from "@/utils/authedFetch";

/**
 * PostgREST rend les colonnes `numeric` sous forme de CHAÎNES (la précision d'un
 * numeric ne tient pas toujours dans un double). Les additionner telles quelles
 * concaténerait des pourcentages.
 */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pct = (v: unknown): string => {
  const n = num(v);
  return n === null ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
};

const seconds = (ms: unknown): string => {
  const n = num(ms);
  return n === null ? "—" : `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
};

/** Centimes d'euro, affichés au millième près : un run coûte souvent < 1 centime. */
const euros = (cents: unknown): string => {
  const n = num(cents);
  if (n === null) return "—";
  return `${(n / 100).toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} €`;
};

const compact = (v: unknown): string => {
  const n = num(v);
  return n === null ? "—" : n.toLocaleString("fr-FR");
};

interface ModelRow {
  provider: string;
  model: string;
  runs: number;
  succes: number;
  echecs: number;
  sans_site: number;
  ignores: number;
  taux_succes_pct: string | null;
  taux_site_atteint_pct: string | null;
  taux_champs_pct: string | null;
  duree_moy_ms: number | null;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  cout_par_run_cents: string | null;
  cout_par_succes_cents: string | null;
  tarif_renseigne: boolean;
}

interface FillRow {
  model: string;
  champ: string;
  runs: number;
  trouves: number;
  taux_pct: string | null;
}

interface FailureRow {
  status: string;
  raison: string;
  model: string;
  occurrences: number;
  dernier: string;
}

interface RunRow {
  id: string;
  created_at: string;
  entreprise_id: number | null;
  source: string;
  status: string;
  outcome_reason: string | null;
  duration_ms: number | null;
  site_url_input: string | null;
  site_reached: boolean;
  scrape_pages: number | null;
  scrape_via: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  llm_attempts: number | null;
  fields_found_count: number | null;
  fields_total: number | null;
  fields_written: string[] | null;
  error_message: string | null;
}

interface PricingRow {
  model: string;
  provider: string;
  input_cents_per_mtok: string;
  output_cents_per_mtok: string;
}

interface Payload {
  installed: boolean;
  hint?: string;
  days?: number;
  by_model?: ModelRow[];
  field_fill_rate?: FillRow[];
  failures?: FailureRow[];
  recent?: RunRow[];
  pricing?: PricingRow[];
}

const PERIODS = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
  { value: "0", label: "Tout l'historique" },
];

const STATUS_LABEL: Record<string, string> = {
  success: "Réussi",
  failed: "Échec",
  no_website: "Sans site",
  skipped: "Ignoré",
};

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" =>
  status === "success" ? "default" : status === "failed" ? "destructive" : "secondary";

/** Libellés lisibles des champs suivis (`TRACKED_FIELDS` de l'edge function). */
const FIELD_LABEL: Record<string, string> = {
  services_tags: "Services",
  company_name_clean: "Nom nettoyé",
  email: "Email",
  logo_url: "Logo",
  address_clean: "Adresse corrigée",
  years_experience: "Années d'expérience",
  rge_count: "Qualifications",
  satisfied_clients_from_site: "Clients satisfaits",
  installations_from_site: "Installations",
  closest_big_city: "Ville SEO",
  surrounding_cities: "Villes alentour",
};

/**
 * Qualité et coût de l'enrichissement, run par run.
 *
 * L'edge function écrivait jusqu'ici trois colonnes sur le projet — modèle et
 * tokens — uniquement en cas de succès, et les écrasait au run suivant. Les
 * échecs n'avaient donc jamais de modèle, et tout le reste (site atteint,
 * pages scrapées, champs trouvés, durées) disparaissait avec les logs de la
 * plateforme. Impossible, dans ces conditions, de dire si la fonction fait bien
 * son travail ni quel modèle est le plus rentable.
 *
 * Ce panneau lit le journal `enrichment_runs`, alimenté à chaque passage.
 */
export function EnrichmentMetricsSettings() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (period: string) => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/settings/enrichment-metrics?days=${period}`);
      const payload = (await res.json()) as Payload;
      setData(res.ok ? payload : { installed: false, hint: "Métriques indisponibles" });
    } catch {
      setData({ installed: false, hint: "Métriques indisponibles" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const models = useMemo(() => data?.by_model ?? [], [data]);
  const fillRate = useMemo(() => data?.field_fill_rate ?? [], [data]);

  /** Une ligne par champ, une colonne par modèle : « qui trouve quoi ». */
  const fillMatrix = useMemo(() => {
    const modelNames = [...new Set(fillRate.map((r) => r.model))].sort();
    const champs = [...new Set(fillRate.map((r) => r.champ))];
    const byKey = new Map(fillRate.map((r) => [`${r.model}::${r.champ}`, r]));
    return { modelNames, champs, byKey };
  }, [fillRate]);

  const untariffed = useMemo(
    () =>
      (data?.pricing ?? []).filter(
        (p) => num(p.input_cents_per_mtok) === 0 && num(p.output_cents_per_mtok) === 0,
      ),
    [data],
  );
  /** Un tarif n'a d'intérêt que pour un modèle qu'on a réellement fait tourner. */
  const untariffedUsed = useMemo(
    () => untariffed.filter((p) => models.some((m) => m.model === p.model && m.runs > 0)),
    [untariffed, models],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Qualité &amp; coût de l&apos;enrichissement
            </CardTitle>
            <CardDescription>
              Une ligne par projet et par passage de l&apos;edge function, échecs compris. De quoi
              comparer les modèles sur ce qu&apos;ils trouvent vraiment, et sur ce qu&apos;ils coûtent.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void load(days)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        )}

        {!loading && data && !data.installed && (
          <p className="text-sm text-muted-foreground">
            Journal des runs indisponible : la migration{" "}
            <code className="text-xs">sql/20260806_enrichment_runs.sql</code> n&apos;est pas encore
            appliquée sur cette base. Les enrichissements continuent de tourner normalement, ils ne
            sont simplement pas mesurés.
          </p>
        )}

        {!loading && data?.installed && models.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun run enregistré sur la période. Le journal ne se remplit qu&apos;à partir du prochain
            enrichissement.
          </p>
        )}

        {!loading && data?.installed && models.length > 0 && (
          <>
            {/* ── Comparatif par modèle ─────────────────────────────────── */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Par modèle</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Modèle</TableHead>
                      <TableHead className="text-right">Runs</TableHead>
                      <TableHead className="text-right">Réussis</TableHead>
                      <TableHead className="text-right">Site atteint</TableHead>
                      <TableHead className="text-right">Champs trouvés</TableHead>
                      <TableHead className="text-right">Durée moy.</TableHead>
                      <TableHead className="text-right">Tokens (in / out)</TableHead>
                      <TableHead className="text-right">€ / run</TableHead>
                      <TableHead className="text-right">€ / fiche enrichie</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models.map((m) => (
                      <TableRow key={`${m.provider}/${m.model}`}>
                        <TableCell className="font-medium">
                          {m.model}
                          <span className="ml-2 text-xs text-muted-foreground">{m.provider}</span>
                        </TableCell>
                        <TableCell className="text-right">{compact(m.runs)}</TableCell>
                        <TableCell className="text-right">
                          {pct(m.taux_succes_pct)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({m.succes}/{m.runs})
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{pct(m.taux_site_atteint_pct)}</TableCell>
                        <TableCell className="text-right">{pct(m.taux_champs_pct)}</TableCell>
                        <TableCell className="text-right">{seconds(m.duree_moy_ms)}</TableCell>
                        <TableCell className="text-right text-xs">
                          {compact(m.tokens_prompt)} / {compact(m.tokens_completion)}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.tarif_renseigne ? (
                            euros(m.cout_par_run_cents)
                          ) : (
                            <span className="text-xs text-muted-foreground">tarif non renseigné</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.tarif_renseigne ? euros(m.cout_par_succes_cents) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                « € / fiche enrichie » rapporte le coût total aux seuls runs réussis : un modèle bon
                marché qui échoue une fois sur deux coûte deux appels par fiche réellement enrichie.
              </p>
              {untariffedUsed.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Tarif à renseigner pour {untariffedUsed.map((p) => p.model).join(", ")} — table{" "}
                  <code>enrichment_llm_pricing</code>, en centimes d&apos;euro par million de tokens.
                  Tant qu&apos;elle vaut 0, aucun coût n&apos;est affiché plutôt qu&apos;un faux coût.
                </p>
              )}
            </section>

            {/* ── Remplissage champ par champ ───────────────────────────── */}
            {fillMatrix.champs.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Champs trouvés par le modèle</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Champ</TableHead>
                        {fillMatrix.modelNames.map((m) => (
                          <TableHead key={m} className="text-right">
                            {m}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fillMatrix.champs.map((champ) => (
                        <TableRow key={champ}>
                          <TableCell className="font-medium">{FIELD_LABEL[champ] ?? champ}</TableCell>
                          {fillMatrix.modelNames.map((model) => {
                            const cell = fillMatrix.byKey.get(`${model}::${champ}`);
                            const value = num(cell?.taux_pct ?? null);
                            return (
                              <TableCell key={model} className="text-right">
                                {value === null ? (
                                  "—"
                                ) : (
                                  <span className="inline-flex items-center gap-2">
                                    <span className="h-1.5 w-16 rounded bg-muted">
                                      <span
                                        className="block h-1.5 rounded bg-primary"
                                        style={{ width: `${Math.min(100, value)}%` }}
                                      />
                                    </span>
                                    {pct(value)}
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ce que le modèle a trouvé sur le site, indépendamment de ce qui a été écrit :
                  l&apos;application est non destructive, un champ déjà rempli sur la fiche n&apos;est
                  jamais réécrit.
                </p>
              </section>
            )}

            {/* ── Causes d'échec ────────────────────────────────────────── */}
            {(data.failures ?? []).length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Pourquoi ça échoue</h3>
                <div className="flex flex-wrap gap-2">
                  {(data.failures ?? []).map((f, i) => (
                    <Badge key={`${f.status}-${f.raison}-${i}`} variant="secondary" className="font-normal">
                      {f.raison}
                      <span className="ml-2 text-xs text-muted-foreground">×{f.occurrences}</span>
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* ── Derniers runs ─────────────────────────────────────────── */}
            {(data.recent ?? []).length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Derniers runs</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Entreprise</TableHead>
                        <TableHead>Origine</TableHead>
                        <TableHead>Issue</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>Modèle</TableHead>
                        <TableHead className="text-right">Champs</TableHead>
                        <TableHead className="text-right">Écrits</TableHead>
                        <TableHead className="text-right">Durée</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.recent ?? []).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {new Date(r.created_at).toLocaleString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-xs">{r.entreprise_id ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.source}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(r.status)} className="font-normal">
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                            {r.outcome_reason && (
                              <span
                                className="ml-2 text-xs text-muted-foreground"
                                title={r.error_message ?? undefined}
                              >
                                {r.outcome_reason}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs" title={r.site_url_input ?? undefined}>
                            {r.site_reached
                              ? `${r.scrape_pages ?? 0} page(s)${r.scrape_via ? ` · ${r.scrape_via}` : ""}`
                              : "injoignable"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.llm_model ?? "—"}
                            {r.llm_attempts && r.llm_attempts > 1 && (
                              <span className="ml-1 text-amber-600 dark:text-amber-500">
                                ×{r.llm_attempts}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {r.fields_total ? `${r.fields_found_count ?? 0}/${r.fields_total}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {r.fields_written?.length ?? 0}
                          </TableCell>
                          <TableCell className="text-right text-xs">{seconds(r.duration_ms)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
