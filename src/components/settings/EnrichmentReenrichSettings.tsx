"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authedFetch } from "@/utils/authedFetch";

/** Périmètres proposés — miroir du `scope` de /api/marketing-pipeline/reenrich. */
const SCOPES = [
  {
    value: "enriched",
    label: "Les enrichissements déjà faits",
    hint: "Les projets en framer / ready / published — les anciens runs à rattraper.",
  },
  {
    value: "failed",
    label: "Les runs en échec",
    hint: "Ceux qui ont planté (site injoignable, extraction ratée). Souvent gratuits à retenter.",
  },
  {
    value: "all",
    label: "Tous les projets",
    hint: "Tout projet lié à une entreprise, enrichi ou pas. Le plus long et le plus coûteux.",
  },
] as const;

type Scope = (typeof SCOPES)[number]["value"];

interface Progress {
  total: number;
  processed: number;
  success: number;
  failed: number;
  no_website: number;
  skipped: number;
  /** Sites publiés republiés dans la foulée (instantané de variables rafraîchi). */
  republished: number;
}

const EMPTY: Progress = { total: 0, processed: 0, success: 0, failed: 0, no_website: 0, skipped: 0, republished: 0 };

const euros = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/**
 * Curseur de reprise, gardé côté navigateur.
 *
 * Un projet ré-enrichi retombe dans son périmètre de départ (framer → draft →
 * framer) : sans mémoire du point d'arrêt, relancer après une interruption
 * repaierait tout depuis le début. Le curseur est un id, donc l'ordre de
 * balayage est stable d'un appel à l'autre.
 */
const cursorKey = (scope: Scope) => `crm.reenrich.cursor.${scope}`;

const readCursor = (scope: Scope): string | null => {
  try {
    return window.localStorage.getItem(cursorKey(scope));
  } catch {
    return null;
  }
};

const writeCursor = (scope: Scope, value: string | null) => {
  try {
    if (value) window.localStorage.setItem(cursorKey(scope), value);
    else window.localStorage.removeItem(cursorKey(scope));
  } catch {
    /* mode privé / quota : on perd juste la reprise */
  }
};

/**
 * Ré-enrichissement en masse.
 *
 * Rejouer l'enrichissement sur d'anciens projets se faisait à la main, carte par
 * carte, sur le tableau Marketing & Web : intenable au-delà de quelques
 * entreprises. Ici on choisit un périmètre et la route
 * `/api/marketing-pipeline/reenrich` le balaie par lots, en rendant un curseur à
 * chaque fois que son budget de temps est épuisé — cet écran la rappelle jusqu'au
 * bout, ce qui permet de traiter tout le parc sans qu'aucune requête n'expire.
 */
export function EnrichmentReenrichSettings() {
  const [scope, setScope] = useState<Scope>("enriched");
  const [overwrite, setOverwrite] = useState(true);
  const [counting, setCounting] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [costCents, setCostCents] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>(EMPTY);
  /** Point d'arrêt du dernier balayage de ce périmètre, s'il n'est pas allé au bout. */
  const [resumeFrom, setResumeFrom] = useState<string | null>(null);
  /** Passé à true par « Arrêter » : la boucle s'arrête après le lot en cours. */
  const stopRef = React.useRef(false);

  useEffect(() => {
    setResumeFrom(readCursor(scope));
    setProgress(EMPTY);
  }, [scope]);

  useEffect(() => {
    authedFetch("/api/settings/enrichment-llm")
      .then((r) => r.json())
      .then((data) => setCostCents(Number(data?.current?.cost_per_run_cents) || 0))
      .catch(() => setCostCents(0));
  }, []);

  // Le compte vient d'un dry-run : même requête, même périmètre, aucune écriture.
  useEffect(() => {
    let cancelled = false;
    setCounting(true);
    setCount(null);
    authedFetch("/api/marketing-pipeline/reenrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, dry_run: true }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCount(typeof data?.total === "number" ? data.total : null);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      })
      .finally(() => {
        if (!cancelled) setCounting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const run = async (fromStart: boolean) => {
    stopRef.current = false;
    setRunning(true);
    const totals = { ...EMPTY };
    try {
      let after: string | null = fromStart ? null : resumeFrom;
      if (fromStart) writeCursor(scope, null);
      // Garde-fou : le curseur avance à chaque appel, mais on ne boucle pas
      // indéfiniment si la route se met à répondre sans progresser.
      for (let pass = 0; pass < 500; pass++) {
        const res = await authedFetch("/api/marketing-pipeline/reenrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, overwrite, ...(after ? { after_id: after } : {}) }),
        });
        const payload = await res.json().catch(() => ({}));
        const s = payload.summary ?? payload.partial ?? {};
        totals.processed += s.processed ?? 0;
        totals.success += s.success ?? 0;
        totals.failed += s.failed ?? 0;
        totals.no_website += s.no_website ?? 0;
        totals.skipped += s.skipped ?? 0;
        totals.republished += s.republished ?? 0;
        if (typeof payload.total === "number") totals.total = payload.total;
        setProgress({ ...totals });
        // Le curseur est enregistré même quand l'appel échoue : ce qui a été
        // enrichi avant l'erreur est payé, on ne le refera pas.
        const next = typeof payload.next_after_id === "string" ? payload.next_after_id : null;
        writeCursor(scope, next);
        setResumeFrom(next);
        if (!res.ok) throw new Error(payload.error ?? "Ré-enrichissement interrompu");
        if (payload.done || !next) break;
        if (stopRef.current) {
          toast.info(`Arrêté — ${totals.processed} projet(s) traités. « Reprendre » continue où on en est.`);
          return;
        }
        after = next;
      }
      toast.success(
        `${totals.success} enrichi(s) · ${totals.no_website} sans site · ${totals.failed} en échec` +
          (totals.skipped > 0 ? ` · ${totals.skipped} ignorés` : "") +
          (totals.republished > 0 ? ` · ${totals.republished} site(s) republié(s)` : ""),
      );
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : "Ré-enrichissement impossible") +
          (totals.processed > 0 ? ` — ${totals.processed} traités avant l'arrêt, relance pour continuer` : ""),
      );
    } finally {
      setRunning(false);
      stopRef.current = false;
    }
  };

  const activeScope = SCOPES.find((s) => s.value === scope)!;
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Ré-enrichir en masse
        </CardTitle>
        <CardDescription>
          Rejoue l&apos;enrichissement sur des projets déjà traités, sans les cocher un par un sur
          le tableau Marketing &amp; Web. Utile après un changement de modèle ou de règle (par
          exemple la ville SEO).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Périmètre</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as Scope)} disabled={running}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{activeScope.hint}</p>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3">
          <Checkbox
            checked={overwrite}
            onCheckedChange={(v) => setOverwrite(v === true)}
            disabled={running}
            className="mt-0.5"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">Écraser les données précédentes</span>
            <span className="block text-xs text-muted-foreground">
              Vide d&apos;abord ce que l&apos;enrichissement avait rempli (nom affiché, email,
              adresse, ville SEO, logo, chiffres clés, tags) pour repartir de zéro. Sans cette
              case, seules les valeurs encore vides sont complétées. Les avis clients et la fiche
              entreprise ne sont jamais touchés.
            </span>
          </span>
        </label>

        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p>
                {counting
                  ? "Comptage du périmètre…"
                  : count === null
                    ? "Périmètre indéterminé — le comptage a échoué."
                    : `${count.toLocaleString("fr-FR")} projet(s) concerné(s).`}
                {count !== null && costCents > 0 && (
                  <>
                    {" "}
                    Coût estimé : <strong>{euros(count * costCents)}</strong> ({euros(costCents)} par
                    enrichissement).
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Chaque projet est rescrapé et repasse par le modèle : c&apos;est l&apos;étape
                payante. Les corrections manuelles de la ville SEO restent protégées, et un projet
                dont un run est déjà en cours est laissé de côté.
              </p>
            </div>
          </div>
        </div>

        {(running || progress.processed > 0) && (
          <div className="space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {progress.processed}
              {progress.total > 0 ? ` / ${progress.total}` : ""} traités · {progress.success} enrichis ·{" "}
              {progress.no_website} sans site · {progress.failed} en échec
              {progress.skipped > 0 ? ` · ${progress.skipped} ignorés` : ""}
              {progress.republished > 0 ? ` · ${progress.republished} site(s) republié(s)` : ""}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(!resumeFrom)} disabled={running || count === 0} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {running
              ? "Ré-enrichissement en cours…"
              : resumeFrom
                ? "Reprendre le ré-enrichissement"
                : "Lancer le ré-enrichissement"}
          </Button>
          {!running && resumeFrom && (
            <Button variant="outline" onClick={() => run(true)} className="gap-2">
              Repartir du début
            </Button>
          )}
          {running && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                stopRef.current = true;
                toast.info("Arrêt après le lot en cours…");
              }}
            >
              <Square className="h-4 w-4" />
              Arrêter
            </Button>
          )}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Le balayage se fait par petits lots : laisse cette page ouverte jusqu&apos;au message
          final. Si tu la fermes ou si tu l&apos;arrêtes, le point d&apos;arrêt est mémorisé —
          «&nbsp;Reprendre&nbsp;» enchaîne à la suite sans repayer ce qui est déjà fait.
        </p>
      </CardContent>
    </Card>
  );
}
