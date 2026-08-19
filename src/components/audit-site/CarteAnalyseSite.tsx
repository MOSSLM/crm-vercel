"use client";
import React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gauge, Copy, Check, ExternalLink } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import type { AuditLu } from "@/lib/audit-site/lecture";
// Le dictionnaire des CMS vit avec l'explorateur, qui l'affiche déjà en
// colonne. Le recopier ici ferait dire « wordpress » à un écran et
// « WordPress » à l'autre pour la même donnée.
import { LABELS_CMS, libelle } from "@/lib/entreprises/explorateur";

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

/** D'où vient la date de dernière modification — la fiabilité n'est pas la même. */
const NOM_SOURCE_MODIF: Record<string, string> = {
  en_tete_html: "en-tête de la page",
  en_tete_ressource: "en-tête d'un fichier du site",
  wayback: "archive Wayback",
};

const moisAnnee = (iso: string | null): string | null =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : null;

const jour = (iso: string | null): string | null =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;

/** Le nombre d'années écoulées, arrondi vers le bas. Sert à qualifier l'âge. */
function anneesDepuis(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms > 0 ? Math.floor(ms / (365.25 * 24 * 3600 * 1000)) : null;
}

/**
 * L'état de la page, dit dans les mots de l'opérateur.
 *
 * `injoignable` ne suffit pas à ouvrir une conversation : « votre site renvoie
 * une page introuvable » et « votre nom de domaine ne répond plus » ne se
 * plaident pas pareil. Le code HTTP est donc traduit, pas affiché brut.
 */
function etatPage(audit: AuditLu): { texte: string; grave: boolean } | null {
  const s = audit.http_status;
  if (audit.bloque) return { texte: "Le site refuse l'analyse automatique (protection anti-robot)", grave: false };
  if (s === 404 || s === 410) return { texte: `Page introuvable — erreur ${s}`, grave: true };
  if (s === 403) return { texte: "Accès refusé — erreur 403", grave: true };
  if (s != null && s >= 500) return { texte: `Le serveur du site est en panne — erreur ${s}`, grave: true };
  if (audit.injoignable) return { texte: "Le domaine ne répond pas du tout", grave: true };
  if (s != null && s >= 300 && s < 400) return { texte: `Redirection permanente — code ${s}`, grave: false };
  return null;
}

/**
 * Le rapport technique : de quoi le site est fait, et depuis quand.
 *
 * C'EST L'ARGUMENT DE VENTE, PAS UNE CURIOSITÉ
 * « Votre site tourne sur WordPress 4.9, sorti en 2017, et rien n'y a été
 * publié depuis 2019 » se vérifie devant le prospect et ne se discute pas.
 *
 * Le bloc `technologie` peut exister avec tous ses champs à `null` : c'est le
 * cas de TOUTES les analyses écrites avant que la détection existe. On le dit
 * explicitement au lieu de n'afficher rien — sans quoi un artisan sous
 * WordPress passerait pour un site non identifiable.
 */
function RapportTechnique({ audit }: { audit: AuditLu }) {
  const t = audit.technologie;
  const etat = etatPage(audit);

  const redirige =
    audit.url_finale && audit.url_analysee && audit.url_finale !== audit.url_analysee
      ? audit.url_finale
      : null;

  const depuis = moisAnnee(t?.waybackPremiereCaptureLe ?? null);
  const age = anneesDepuis(t?.waybackPremiereCaptureLe ?? null);
  const modifLe = jour(t?.derniereModifDetecteeLe ?? null);
  const ansSansModif = anneesDepuis(t?.derniereModifDetecteeLe ?? null);

  // Une analyse antérieure à la détection porte un bloc `technologie` dont tous
  // les champs sont nuls. Le distinguer de « site vraiment non identifiable »
  // évite de faire passer un défaut de fraîcheur pour un résultat.
  const technoConnue = !!(t && (t.cms || t.generateurBrut || t.waybackPremiereCaptureLe || t.derniereModifDetecteeLe));

  const lignes: Array<{ cle: string; valeur: React.ReactNode }> = [];

  if (t?.cms) {
    lignes.push({
      cle: "Technologie",
      valeur: (
        <>
          <b className="text-foreground">{libelle(LABELS_CMS, t.cms)}</b>
          {t.cmsVersion && <span> {t.cmsVersion}</span>}
          {t.constructeur && <span> · {t.constructeur}</span>}
          {t.theme && <span> · thème {t.theme}</span>}
        </>
      ),
    });
  } else if (t?.generateurBrut) {
    lignes.push({ cle: "Technologie", valeur: <span className="text-foreground">{t.generateurBrut}</span> });
  }

  if (depuis) {
    lignes.push({
      cle: "En ligne depuis",
      valeur: (
        <>
          <span className="text-foreground">{depuis}</span>
          {age != null && age >= 1 && <span> · {age} an{age > 1 ? "s" : ""}</span>}
        </>
      ),
    });
  }

  if (modifLe) {
    lignes.push({
      cle: "Dernière modification",
      valeur: (
        <>
          <span className={ansSansModif != null && ansSansModif >= 2 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}>
            {modifLe}
          </span>
          {ansSansModif != null && ansSansModif >= 1 && (
            <span> · il y a {ansSansModif} an{ansSansModif > 1 ? "s" : ""}</span>
          )}
          {t?.sourceDerniereModif && (
            <span className="opacity-70"> ({NOM_SOURCE_MODIF[t.sourceDerniereModif] ?? t.sourceDerniereModif})</span>
          )}
        </>
      ),
    });
  }

  if (audit.poids_octets != null) {
    lignes.push({
      cle: "Poids de la page",
      valeur: <span className="text-foreground">{(audit.poids_octets / 1_048_576).toFixed(1)} Mo</span>,
    });
  }

  if (audit.ttfb_ms != null || audit.chargement_ms != null) {
    lignes.push({
      cle: "Temps de réponse",
      valeur: (
        <span className="text-foreground">
          {audit.chargement_ms != null ? `${(audit.chargement_ms / 1000).toFixed(1)} s` : "—"}
          {audit.ttfb_ms != null && <span className="opacity-70"> (serveur {audit.ttfb_ms} ms)</span>}
        </span>
      ),
    });
  }

  // Rien à dire du tout : ni état anormal, ni techno, ni mesure. Se taire.
  if (!etat && !redirige && lignes.length === 0 && technoConnue) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Rapport technique
      </div>

      {etat && (
        <p className={`text-sm font-medium ${etat.grave ? "text-red-600" : "text-amber-600 dark:text-amber-400"}`}>
          {etat.texte}
        </p>
      )}

      {redirige && (
        <p className="text-xs text-muted-foreground">
          Redirige vers <span className="break-all text-foreground">{redirige}</span>
        </p>
      )}

      {lignes.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {lignes.map((l) => (
            <React.Fragment key={l.cle}>
              <dt className="whitespace-nowrap">{l.cle}</dt>
              <dd className="min-w-0">{l.valeur}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {!technoConnue && (
        <p className="text-xs text-muted-foreground">
          Technologie non détectée — cette analyse est antérieure à la détection. Ré-analysez le
          site pour obtenir le CMS, l&apos;ancienneté et la date de dernière mise à jour.
        </p>
      )}

      {audit.analyse_le && (
        <p className="text-[11px] text-muted-foreground opacity-70">
          Analysé le {jour(audit.analyse_le)}
        </p>
      )}
    </div>
  );
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
            {/* Le titre reprend la cause exacte quand on la connaît : un 404 et un
                domaine mort ne se plaident pas de la même façon au téléphone. */}
            <p className="text-sm font-medium text-red-600">
              {!audit.url_analysee
                ? "Aucun site renseigné"
                : (etatPage(audit)?.texte ?? "Site injoignable")}
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

        {/* Le rapport technique vaut pour les deux états : sur un site vivant il
            date la techno, sur un site cassé il nomme la panne. */}
        {audit && <RapportTechnique audit={audit} />}

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
