"use client";
import React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gauge, Copy, Check, ExternalLink } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import type { AuditLu } from "@/lib/audit-site/lecture";

/**
 * L'analyse du site actuel dans la fiche entreprise — et le lien du rapport.
 *
 * C'est l'écran que l'agent a sous les yeux AVANT de décrocher son téléphone :
 * il doit y trouver de quoi ouvrir la conversation (« votre site met 4,2 s à
 * s'afficher ») et de quoi la conclure (un lien à envoyer). Les deux au même
 * endroit, parce que c'est le même geste.
 *
 * Se cache entièrement quand les migrations ne sont pas appliquées : une
 * fonctionnalité absente ne doit pas ressembler à une panne.
 */

const NOM_AXE: Record<string, string> = {
  vitesse: "Vitesse",
  seo: "Référencement",
  mobile: "Mobile",
  conversion: "Contact",
  popularite: "Popularité",
  // Deux axes que seule une mesure Google produit : notre analyseur lit du HTML,
  // il n'exécute rien et ne peut donc pas en juger.
  accessibilite: "Accessibilité",
  bonnes_pratiques: "Bonnes pratiques",
};

function ton(n: number): string {
  return n >= 70 ? "text-emerald-600" : n >= 45 ? "text-amber-600" : "text-red-600";
}

export function CarteAnalyseSite({ entrepriseId }: { entrepriseId: number }) {
  const [audit, setAudit] = React.useState<AuditLu | null>(null);
  const [absent, setAbsent] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "analyse" | "psi" | "lien">(null);
  const [lien, setLien] = React.useState<string | null>(null);
  const [copie, setCopie] = React.useState(false);

  React.useEffect(() => {
    let vivant = true;
    void (async () => {
      const res = await authedFetch(`/api/audit-site/${entrepriseId}`).catch(() => null);
      if (!vivant || !res) return;
      const body = (await res.json().catch(() => ({}))) as {
        disponible?: boolean;
        audit?: AuditLu | null;
      };
      if (body.disponible === false) setAbsent(true);
      else setAudit(body.audit ?? null);
    })();
    return () => {
      vivant = false;
    };
  }, [entrepriseId]);

  const appeler = async (
    chemin: string,
    quoi: "analyse" | "psi",
    succes: string,
  ) => {
    setBusy(quoi);
    try {
      const res = await authedFetch(chemin, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        audit?: AuditLu | null;
        error?: string;
        avertissements?: string[];
      };
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
      setAudit(body.audit ?? null);
      toast.success(succes);
      // Les avertissements (capture indisponible, comparaison manquante) sont
      // montrés à l'opérateur : c'est lui qui décide si le rapport est
      // présentable en l'état.
      for (const a of body.avertissements ?? []) toast.warning(a);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(null);
    }
  };

  const obtenirLien = async () => {
    setBusy("lien");
    try {
      const res = await authedFetch(`/api/rapport-public/${entrepriseId}`);
      const body = (await res.json().catch(() => ({}))) as {
        disponible?: boolean;
        url?: string;
        motif?: string;
      };
      if (body.disponible === false) throw new Error(body.motif || "Rapport indisponible.");
      if (!body.url) throw new Error("Lien indisponible.");
      setLien(body.url);
      await navigator.clipboard.writeText(body.url).catch(() => {});
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
      toast.success("Lien du rapport copié.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(null);
    }
  };

  if (absent) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-muted-foreground" /> Analyse du site actuel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!audit ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Aucune analyse. Mesurez le site du prospect pour ouvrir la conversation sur des
              chiffres.
            </p>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => appeler(`/api/audit-site/${entrepriseId}`, "analyse", "Site analysé.")}
            >
              {busy === "analyse" ? "Analyse…" : "Analyser le site"}
            </Button>
          </div>
        ) : audit.injoignable || audit.note_globale == null ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-600">
              {audit.url_analysee ? "Site injoignable" : "Aucun site renseigné"}
            </p>
            <p className="text-xs text-muted-foreground">
              {audit.url_analysee
                ? `${audit.url_analysee} ne répond pas. C'est un argument : le prospect est invisible en ligne.`
                : "Cette entreprise n'a pas d'adresse de site. C'est le meilleur cas de figure pour vendre."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className={`text-3xl font-light ${ton(audit.note_globale)}`}>
                  {audit.note_globale}
                </span>
                <span className="text-xs text-muted-foreground">/100</span>
                {audit.libelle && (
                  <span className="ml-1 text-sm text-muted-foreground">{audit.libelle}</span>
                )}
              </div>
              {audit.note_globale_demo != null && (
                <div className="flex items-baseline gap-1.5 border-l pl-5">
                  <span className="text-xs text-muted-foreground">notre démo</span>
                  <span className={`text-2xl font-light ${ton(audit.note_globale_demo)}`}>
                    {audit.note_globale_demo}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {audit.axes.map((a) => (
                <span key={a.id} className="text-muted-foreground">
                  {NOM_AXE[a.id] ?? a.id}{" "}
                  <b className={ton(a.note)}>{a.note}</b>
                  {a.mesureGoogle && <span className="ml-1 opacity-60">(Google)</span>}
                </span>
              ))}
            </div>

            {audit.axes_masques.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Analyse partielle — non concluant sur :{" "}
                {audit.axes_masques.map((a) => NOM_AXE[a] ?? a).join(", ")}.
              </p>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {audit && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => appeler(`/api/audit-site/${entrepriseId}`, "analyse", "Site ré-analysé.")}
            >
              {busy === "analyse" ? "…" : "Ré-analyser"}
            </Button>
          )}
          {audit && !audit.injoignable && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              title="Mesure dans un vrai navigateur. Remplace nos notes de site par celles de Google, et récupère la liste de ce qu'il relève."
              onClick={() =>
                appeler(
                  `/api/audit-site/${entrepriseId}/pagespeed`,
                  "psi",
                  "Mesuré par Google PageSpeed.",
                )
              }
            >
              {busy === "psi" ? "…" : "Mesurer avec Google"}
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={obtenirLien}>
            {copie ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            Lien du rapport
          </Button>
          {lien && (
            <Button size="sm" variant="ghost" asChild>
              <a href={lien} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Ouvrir
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
