"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/utils/authedFetch";

type Totals = { updated: number; unchanged: number; skipped: number; failed: number };

/**
 * Rattrapage de la note et du nombre d'avis depuis Google Places.
 *
 * Ces deux chiffres étaient récupérés à chaque enrichissement puis jetés :
 * `userRatingCount` ne servait qu'à estimer les « clients satisfaits », et rien
 * ne l'écrivait sur l'entreprise. Leur valeur restait celle du scraping initial,
 * qui relevait souvent la note sans le compte — d'où des fiches affichant
 * « 4,8 (0 avis) » sur leur site.
 *
 * Aucune IA ici : `rating` et `userRatingCount` sont deux champs de l'API Places.
 * Un réenrichissement complet aurait coûté un scraping et un appel LLM par fiche,
 * et n'aurait de toute façon atteint aucune de ces entreprises — elles n'ont pas
 * de projet lead magnet, sur quoi l'enrichissement s'indexe.
 */
export function GoogleStatsSettings() {
  const [candidates, setCandidates] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = useCallback(
    () =>
      authedFetch("/api/settings/google-stats")
        .then((r) => r.json())
        .then((d) => setCandidates(typeof d?.candidates === "number" ? d.candidates : null))
        .catch(() => setCandidates(null)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRunning(true);
    setProgress(0);
    const totals: Totals = { updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    try {
      let after: number | null = null;
      // Reprise par curseur : la route rend un `next_after_id` dès que son budget
      // de temps est épuisé, pour ne pas tomber en 504 sur un gros parc.
      for (let pass = 0; pass < 200; pass++) {
        const res = await authedFetch("/api/settings/google-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(after !== null ? { after_id: after } : {}),
        });
        const payload = await res.json().catch(() => ({}));
        const s = payload.summary ?? payload.partial ?? {};
        totals.updated += s.updated ?? 0;
        totals.unchanged += s.unchanged ?? 0;
        totals.skipped += s.skipped ?? 0;
        totals.failed += s.failed ?? 0;
        if (!res.ok) throw new Error(payload.error ?? "Rattrapage impossible");
        setProgress(totals.updated + totals.unchanged + totals.skipped + totals.failed);
        if (payload.done || payload.next_after_id == null) break;
        after = payload.next_after_id as number;
      }
      const parts = [`${totals.updated} fiche(s) mise(s) à jour`, `${totals.unchanged} inchangée(s)`];
      // `skipped` = aucun place_id exploitable, y compris après recherche par nom.
      if (totals.skipped > 0) parts.push(`${totals.skipped} sans fiche Google trouvable`);
      if (totals.failed > 0) parts.push(`${totals.failed} en échec`);
      toast.success(parts.join(" · "));
      await load();
    } catch (e) {
      const seen = totals.updated + totals.unchanged + totals.skipped + totals.failed;
      toast.error(
        (e instanceof Error ? e.message : "Rattrapage impossible") +
          (seen > 0 ? ` — ${totals.updated} mise(s) à jour avant l'arrêt, relance pour continuer` : ""),
      );
      await load();
    } finally {
      setRunning(false);
      setProgress(0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-4 w-4" />
          Note et avis Google
        </CardTitle>
        <CardDescription>
          Va rechercher la note moyenne et le nombre d&apos;avis sur la fiche Google des
          entreprises qui en manquent. Un appel à l&apos;API Places par fiche — pas de
          scraping, pas d&apos;IA, ce sont deux champs d&apos;API. Utile pour les fiches dont
          le scraping initial n&apos;avait relevé que la note : leur site affichait
          «&nbsp;4,8 (0&nbsp;avis)&nbsp;».
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant={candidates && candidates > 0 ? "destructive" : "outline"}>
          {candidates === null
            ? "Nombre de fiches inconnu"
            : candidates === 0
              ? "Aucune fiche à rattraper"
              : `${candidates} fiche(s) à rattraper`}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={running || candidates === 0}
          className="gap-2"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running && progress > 0 ? `Rattrapage… ${progress} fiches` : "Rattraper depuis Google"}
        </Button>
      </CardContent>
    </Card>
  );
}
