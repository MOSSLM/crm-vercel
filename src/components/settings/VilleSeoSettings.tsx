"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/utils/authedFetch";
import { DEPARTEMENT_CODES } from "@/lib/site-builder/geo-fr";

interface GeoSettings {
  metro_population: number;
  metro_radius_km: number;
  big_city_population: number;
  preferred_radius_km: number;
  max_radius_km: number;
}

interface Override {
  id: number;
  code_postal: string;
  commune: string | null;
  ville_seo: string;
  note: string | null;
}

const SETTING_FIELDS: Array<{ key: keyof GeoSettings; label: string; hint: string }> = [
  { key: "metro_population", label: "Seuil métropole (hab.)", hint: "Au-dessus, une ville l'emporte sur tout le reste si elle est à portée." },
  { key: "metro_radius_km", label: "Rayon métropole (km)", hint: "Distance dans laquelle une métropole gagne d'office." },
  { key: "big_city_population", label: "Seuil grande ville (hab.)", hint: "Population minimale pour être candidate." },
  { key: "preferred_radius_km", label: "Rayon confortable (km)", hint: "Dedans, c'est la plus peuplée qui gagne — c'est ce palier qui tranche Chalon vs Mâcon." },
  { key: "max_radius_km", label: "Rayon maximal (km)", hint: "Au-delà, on ne propose plus rien et on retombe sur la ville de l'entreprise." },
];

const EMPTY_OVERRIDE = { code_postal: "", commune: "", ville_seo: "", note: "" };

/**
 * Ville SEO : référentiel des communes, seuils d'arbitrage et corrections
 * manuelles.
 *
 * La ville SEO (la grande ville mise en avant sur les sites) est calculée par
 * l'edge function d'enrichissement sur la distance réelle. Ça suppose que le
 * référentiel des communes soit chargé — d'où le bouton de chargement ici, qui
 * itère sur les départements pour rester dans les temps d'exécution serverless.
 */
export function VilleSeoSettings() {
  const [status, setStatus] = useState<{ ready: boolean; migrated: boolean; count: number; updated_at: string | null } | null>(null);
  const [settings, setSettings] = useState<GeoSettings | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [draft, setDraft] = useState(EMPTY_OVERRIDE);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  /** Projets déjà vus par le recalcul en cours — affiché pendant le balayage. */
  const [recomputeProgress, setRecomputeProgress] = useState(0);

  const refresh = useCallback(async () => {
    const [statusRes, configRes] = await Promise.all([
      authedFetch("/api/settings/communes-fr").then((r) => r.json()).catch(() => null),
      authedFetch("/api/settings/ville-seo").then((r) => r.json()).catch(() => null),
    ]);
    if (statusRes) setStatus(statusRes);
    if (configRes?.settings) setSettings(configRes.settings);
    if (Array.isArray(configRes?.overrides)) setOverrides(configRes.overrides);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const lastUpdate = useMemo(() => {
    if (!status?.updated_at) return null;
    return new Date(status.updated_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  }, [status?.updated_at]);

  const seed = async () => {
    setSeeding({ done: 0, total: DEPARTEMENT_CODES.length });
    let failures = 0;
    for (const [index, code] of DEPARTEMENT_CODES.entries()) {
      try {
        const res = await authedFetch("/api/settings/communes-fr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ departement: code }),
        });
        if (!res.ok) {
          failures++;
          // Migration absente : inutile d'enchaîner les 100 départements suivants.
          if (res.status === 409) {
            const msg = (await res.json().catch(() => ({}))).error;
            toast.error(typeof msg === "string" ? msg : "Table communes_fr absente");
            break;
          }
        }
      } catch {
        failures++;
      }
      setSeeding({ done: index + 1, total: DEPARTEMENT_CODES.length });
    }
    setSeeding(null);
    await refresh();
    if (failures === 0) toast.success("Référentiel des communes à jour");
    else toast.warning(`${failures} département(s) n'ont pas pu être chargés — relance pour compléter`);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await authedFetch("/api/settings/ville-seo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Enregistrement impossible");
      toast.success("Seuils enregistrés");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const addOverride = async () => {
    if (!/^\d{5}$/.test(draft.code_postal.trim()) || !draft.ville_seo.trim()) {
      toast.error("Code postal (5 chiffres) et ville SEO sont requis");
      return;
    }
    try {
      const res = await authedFetch("/api/settings/ville-seo/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Ajout impossible");
      setDraft(EMPTY_OVERRIDE);
      await refresh();
      toast.success("Correction enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ajout impossible");
    }
  };

  const removeOverride = async (id: number) => {
    const res = await authedFetch(`/api/settings/ville-seo/overrides?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Suppression impossible");
      return;
    }
    setOverrides((prev) => prev.filter((o) => o.id !== id));
  };

  /**
   * Le recalcul balaie tout le parc par lots : la route rend un curseur
   * (`next_after_id`) dès que son budget de temps est épuisé, et on la rappelle
   * jusqu'à `done`. Un seul appel expirait au bout de quelques milliers de
   * projets — c'était l'erreur affichée ici.
   */
  const recompute = async () => {
    setRecomputing(true);
    const totals = { updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    try {
      let after: string | null = null;
      for (let pass = 0; pass < 200; pass++) {
        const res = await authedFetch("/api/settings/ville-seo/recompute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(after ? { after_id: after } : {}),
        });
        const payload = await res.json().catch(() => ({}));
        const s = payload.summary ?? payload.partial ?? {};
        totals.updated += s.updated ?? 0;
        totals.unchanged += s.unchanged ?? 0;
        totals.skipped += s.skipped ?? 0;
        totals.failed += s.failed ?? 0;
        if (!res.ok) throw new Error(payload.error ?? "Recalcul impossible");
        setRecomputeProgress(totals.updated + totals.unchanged + totals.skipped + totals.failed);
        if (payload.done || !payload.next_after_id) break;
        after = payload.next_after_id as string;
      }
      toast.success(
        `${totals.updated} ville(s) SEO mises à jour · ${totals.unchanged} inchangées · ${totals.skipped} saisies à la main`,
      );
    } catch (e) {
      const seen = totals.updated + totals.unchanged + totals.skipped + totals.failed;
      toast.error(
        (e instanceof Error ? e.message : "Recalcul impossible") +
          (seen > 0 ? ` — ${totals.updated} mise(s) à jour avant l'arrêt, relance pour continuer` : ""),
      );
    } finally {
      setRecomputing(false);
      setRecomputeProgress(0);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Ville SEO
        </CardTitle>
        <CardDescription>
          La grande ville mise en avant sur les sites (Quetigny → Dijon). Elle est calculée sur la
          distance réelle à partir du référentiel officiel des communes, pas devinée.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {status && !status.migrated && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Migration non appliquée : exécute <code>sql/20260727_ville_seo_geo.sql</code> dans
            l&apos;éditeur SQL Supabase. En attendant, l&apos;enrichissement continue de fonctionner
            en retombant sur l&apos;estimation du modèle.
          </div>
        )}

        {/* Référentiel */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-medium">Référentiel des communes</Label>
              <p className="text-xs text-muted-foreground">
                {status?.ready
                  ? `${status.count.toLocaleString("fr-FR")} communes chargées${lastUpdate ? ` · ${lastUpdate}` : ""}`
                  : "Aucune commune chargée — le calcul géographique est inactif."}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={seed} disabled={!!seeding || !status?.migrated}>
              {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {seeding ? `${seeding.done}/${seeding.total}` : status?.ready ? "Rafraîchir" : "Charger"}
            </Button>
          </div>
          {seeding && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((seeding.done / seeding.total) * 100)}%` }}
              />
            </div>
          )}
        </section>

        {/* Seuils */}
        {settings && (
          <section className="space-y-3">
            <Label className="text-sm font-medium">Règle d&apos;arbitrage</Label>
            <p className="text-xs text-muted-foreground">
              Dans l&apos;ordre : une métropole à portée gagne ; sinon la plus peuplée dans le rayon
              confortable ; sinon la plus proche jusqu&apos;au rayon maximal.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SETTING_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    type="number"
                    value={settings[f.key]}
                    onChange={(e) =>
                      setSettings((s) => (s ? { ...s, [f.key]: Number(e.target.value) } : s))
                    }
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={saveSettings} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer les seuils
              </Button>
              <Button variant="outline" size="sm" onClick={recompute} disabled={recomputing || !status?.ready}>
                {recomputing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {recomputing && recomputeProgress > 0
                  ? `Recalcul… ${recomputeProgress} projets`
                  : "Recalculer les projets existants"}
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Le recalcul ne rescrape rien et n&apos;appelle aucun modèle : il est gratuit et
              relançable. Les villes SEO saisies à la main ne sont jamais touchées. Il balaie
              tout le parc par lots — laisse la page ouverte jusqu&apos;au message final.
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Île-de-France (75, 77, 78, 91, 92, 93, 94, 95) : la ville SEO est
              «&nbsp;Région parisienne&nbsp;», pas une commune. Dans l&apos;agglomération, la
              ville la plus proche n&apos;a souvent aucun rapport avec l&apos;entreprise
              (Évry-Courcouronnes →&nbsp;Montreuil). Une correction manuelle reste
              prioritaire si tu veux une ville précise sur un code postal.
            </p>
          </section>
        )}

        {/* Corrections manuelles */}
        <section className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Corrections manuelles</Label>
            <p className="text-xs text-muted-foreground">
              Priment sur le calcul. Une ligne vaut pour toutes les entreprises du code postal —
              précise la commune pour restreindre la règle.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr_auto]">
            <Input
              placeholder="21800"
              value={draft.code_postal}
              onChange={(e) => setDraft((d) => ({ ...d, code_postal: e.target.value }))}
            />
            <Input
              placeholder="Commune (facultatif)"
              value={draft.commune}
              onChange={(e) => setDraft((d) => ({ ...d, commune: e.target.value }))}
            />
            <Input
              placeholder="Ville SEO imposée"
              value={draft.ville_seo}
              onChange={(e) => setDraft((d) => ({ ...d, ville_seo: e.target.value }))}
            />
            <Button variant="outline" size="sm" onClick={addOverride}>
              <Plus className="mr-1 h-4 w-4" /> Ajouter
            </Button>
          </div>

          {overrides.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune correction — le calcul décide partout.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {overrides.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{o.code_postal}</Badge>
                    {o.commune && <span className="text-muted-foreground">{o.commune}</span>}
                    <span aria-hidden>→</span>
                    <span className="font-medium">{o.ville_seo}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => removeOverride(o.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
