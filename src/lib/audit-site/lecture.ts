import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxeId, Confiance, ConstatGoogle, Preuve } from "./types";
import { libelleDeNote, noteDepuisPreuves } from "./score";
import { psiEstFraiche } from "./pagespeed";

/**
 * Lire une analyse, et savoir dire « pas disponible » sans faire croire à une
 * panne.
 *
 * La table `entreprises_audit_site` est neuve et les migrations s'appliquent à
 * la main : sur un environnement en retard, elle n'existe pas. La différence
 * entre « la table manque » et « le site du prospect est cassé » compte
 * énormément pour l'opérateur, qui n'a pas accès aux logs — d'où le
 * `{ disponible: false }` explicite plutôt qu'une erreur générique.
 *
 * C'est aussi ici qu'est appliquée la règle de publication : un axe en
 * confiance faible n'est PAS renvoyé au client, quel que soit l'appelant. La
 * régler au niveau de la lecture évite qu'un futur écran l'oublie.
 */

/** Postgres `undefined_table`. */
export const UNDEFINED_TABLE = "42P01";

/**
 * Ce qui peut être publié comme axe.
 *
 * Plus large que `AxeId` : quand Google a mesuré, ce sont SES catégories qu'on
 * affiche, et deux d'entre elles n'ont pas d'équivalent maison. Notre analyseur
 * ne sait pas juger l'accessibilité réelle ni les bonnes pratiques — il lit du
 * HTML, il n'exécute rien.
 */
export type AxePublieId = AxeId | "accessibilite" | "bonnes_pratiques";

export interface AxePublie {
  id: AxePublieId;
  note: number;
  confiance: Confiance;
  /** Uniquement les preuves réellement mesurées : les autres n'existent pas. */
  preuves: Preuve[];
  /**
   * Vrai quand la note vient de PageSpeed Insights et non de notre analyseur.
   * La page l'affiche alors avec la mention « mesuré par Google » — qui vaut
   * caution auprès du prospect, et qu'on ne peut donc pas revendiquer à tort.
   */
  mesureGoogle?: boolean;
  /** Ce que Google relève sur cet axe, dans ses mots. Vide hors mesure Google. */
  constats?: ConstatGoogle[];
}

export interface AuditLu {
  entreprise_id: number;
  url_analysee: string | null;
  url_finale: string | null;
  http_status: number | null;
  bloque: boolean;
  injoignable: boolean;
  note_globale: number | null;
  libelle: string | null;
  /** Axes publiables — ceux en confiance faible en sont retirés. */
  axes: AxePublie[];
  /** Axes écartés, nommés : l'opérateur doit savoir POURQUOI c'est plus court. */
  axes_masques: AxePublieId[];
  issue_keys: string[];
  /**
   * Ce que Lighthouse relève, trié par gain. Vide quand aucune mesure Google n'a
   * été faite — ou quand elle a plus de trente jours : un constat périmé sur un
   * site refait entre-temps est une affirmation fausse, et une seule suffit à
   * discréditer le reste du rapport.
   */
  constats_google: ConstatGoogle[];
  /**
   * Ce que l'agent a relevé lui-même, dans le cadre de `lib/audit/observations`.
   *
   * Typé `unknown[]` ici et non `ObservationValidee[]` : `lecture` appartient à
   * `audit-site`, qui ne doit pas dépendre de `audit`. La forme est garantie à
   * l'écriture par `validerObservations` — c'est le seul chemin qui remplit
   * cette clé — et retypée à la lecture par `construireMesures`.
   */
  observations: unknown[];
  alertes: string[];
  ttfb_ms: number | null;
  chargement_ms: number | null;
  poids_octets: number | null;
  capture_url: string | null;
  note_globale_demo: number | null;
  analyse_le: string | null;
  psi_performance: number | null;
  psi_recupere_le: string | null;
}

export type LectureAudit =
  | { disponible: true; audit: AuditLu | null }
  | { disponible: false; motif: string };

export async function lireAudit(
  sb: SupabaseClient,
  entrepriseId: number,
): Promise<LectureAudit> {
  const { data, error } = await sb
    .from("entreprises_audit_site")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { disponible: false, motif: "sql/20260810_audit_site.sql n'est pas appliquée." };
    }
    return { disponible: false, motif: error.message };
  }
  if (!data) return { disponible: true, audit: null };

  return { disponible: true, audit: versAuditLu(data as Record<string, unknown>) };
}

/** Plusieurs entreprises d'un coup — pour le pipeline, qui affiche des lignes. */
export async function lireAudits(
  sb: SupabaseClient,
  entrepriseIds: number[],
): Promise<Map<number, AuditLu> | null> {
  if (entrepriseIds.length === 0) return new Map();
  const { data, error } = await sb
    .from("entreprises_audit_site")
    .select("*")
    .in("entreprise_id", entrepriseIds);

  // null ⇒ « indisponible », que l'appelant traduit en badge caché.
  if (error) return null;

  const out = new Map<number, AuditLu>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const lu = versAuditLu(row);
    out.set(lu.entreprise_id, lu);
  }
  return out;
}

function versAuditLu(row: Record<string, unknown>): AuditLu {
  const detail = (row.detail ?? {}) as Partial<Record<AxeId, Preuve[]>> & {
    google?: ConstatGoogle[];
    observations?: unknown[];
  };
  const confiance = (row.confiance ?? {}) as Partial<Record<AxeId, Confiance>>;

  /**
   * COHABITATION DES DEUX VITESSES — la règle, écrite une seule fois.
   *
   * Quand une mesure PageSpeed est fraîche, elle REMPLACE la note vitesse
   * maison. Jamais les deux côte à côte : une page qui affiche « vitesse 64 »
   * et « performance Google 31 » se contredit sous les yeux du prospect, et
   * c'est la crédibilité de tout le rapport qui part avec.
   *
   * Le remplacement se fait ici, au point de lecture, pour que ni la page
   * publique ni le badge CRM n'aient à trancher — donc pour qu'ils ne puissent
   * pas trancher différemment.
   */
  const psiFraiche = psiEstFraiche(str(row.psi_recupere_le));
  const psiPerf = num(row.psi_performance);
  const vitesseGoogle = psiFraiche && psiPerf != null;

  /**
   * La popularité n'a PAS de colonne dédiée, et c'est voulu.
   *
   * Sa note se recalcule depuis ses preuves stockées dans `detail`. Ajouter une
   * colonne aurait fait dépendre tout l'écrit d'une migration appliquée à la
   * main : un `upsert` qui nomme une colonne absente échoue ENTIÈREMENT, et
   * c'est exactement la panne déjà vécue avec `paywall_enabled`. Ici, migration
   * ou pas, l'axe apparaît dès que ses preuves sont là.
   */
  const google = vitesseGoogle && Array.isArray(detail.google) ? detail.google : [];
  const constatsDe = (categorie: string) => google.filter((c) => c.categorie === categorie);

  const axes: AxePublie[] = [];
  const masques: AxePublieId[] = [];

  /** Un axe n'est publié que s'il a une note ET assez de confiance. */
  const publier = (a: AxePublie | null, id: AxePublieId) => (a ? axes.push(a) : masques.push(id));

  const axeGoogle = (
    id: AxePublieId,
    note: number | null,
    categorie: string,
    preuves: Preuve[] = [],
  ): AxePublie | null =>
    note == null
      ? null
      // Confiance haute sans condition : la mesure vient d'un vrai navigateur.
      // Notre réserve — « c'est peut-être une SPA » — n'a plus lieu d'être quand
      // le JavaScript a réellement été exécuté.
      : { id, note, confiance: "haute", preuves, mesureGoogle: true, constats: constatsDe(categorie) };

  const axeMaison = (id: AxeId): AxePublie | null => {
    const note =
      id === "popularite" ? noteDepuisPreuves(detail.popularite ?? []) : num(row[`note_${id}`]);
    const conf = confiance[id] ?? "faible";
    // La règle, à un seul endroit : sous le seuil de confiance, l'axe n'est pas
    // publié. Le griser reviendrait à publier le chiffre en le décorant.
    if (note == null || conf === "faible") return null;
    return {
      id,
      note,
      confiance: conf,
      preuves: (detail[id] ?? []).filter((p) => p.verdict !== "inconnu" && p.valeur !== null),
    };
  };

  if (vitesseGoogle) {
    /**
     * GOOGLE A MESURÉ : ON S'EFFACE.
     *
     * Nos notes de vitesse, de référencement et de mobile ne sont plus publiées.
     * Ce n'est pas de la modestie — c'est que les nôtres se discutent et que
     * celles de Google se vérifient en trente secondes sur pagespeed.web.dev,
     * devant le prospect, depuis son téléphone. Une note qu'on peut nous opposer
     * vaut moins que la même note que le prospect peut opposer à son prestataire
     * actuel.
     *
     * L'axe `mobile` disparaît alors purement et simplement, et il n'est même pas
     * listé comme masqué : il n'est pas retenu faute de confiance, il est
     * REMPLACÉ — l'accessibilité et les cibles tactiles de Google disent la même
     * chose en mieux, et c'était de loin notre signal le plus fragile.
     */
    publier(axeGoogle("vitesse", psiPerf, "performance", preuvesPsi(row)), "vitesse");
    // Repli sur notre note de référencement si Google n'a pas rendu la sienne :
    // un seul chiffre affiché, donc aucune contradiction possible à l'écran.
    publier(axeGoogle("seo", num(row.psi_seo), "seo") ?? axeMaison("seo"), "seo");
    publier(axeGoogle("accessibilite", num(row.psi_accessibilite), "accessibility"), "accessibilite");
    publier(
      axeGoogle("bonnes_pratiques", num(row.psi_bonnes_pratiques), "best-practices"),
      "bonnes_pratiques",
    );
  } else {
    for (const id of ["vitesse", "seo", "mobile"] as const) publier(axeMaison(id), id);
  }

  // Ce que Google ne mesure pas et ne mesurera jamais : est-ce qu'on peut vous
  // joindre, et est-ce qu'on parle de vous. Ces deux axes-là restent les nôtres
  // dans tous les cas — ce sont aussi les deux qui se vendent le mieux.
  for (const id of ["conversion", "popularite"] as const) publier(axeMaison(id), id);

  const noteGlobale = num(row.note_globale);

  return {
    entreprise_id: Number(row.entreprise_id),
    url_analysee: str(row.url_analysee),
    url_finale: str(row.url_finale),
    http_status: num(row.http_status),
    bloque: row.bloque === true,
    injoignable: row.injoignable === true,
    note_globale: noteGlobale,
    libelle: noteGlobale == null ? null : libelleDeNote(noteGlobale),
    axes,
    axes_masques: masques,
    issue_keys: Array.isArray(row.issue_keys) ? (row.issue_keys as string[]) : [],
    constats_google: psiFraiche && Array.isArray(detail.google) ? detail.google : [],
    // Pas de péremption ici, contrairement aux constats Google : une observation
    // est datée par l'audit qui l'a produite, et c'est ce document-là qu'on
    // renvoie. La périmer indépendamment viderait un audit déjà envoyé.
    observations: Array.isArray(detail.observations) ? detail.observations : [],
    alertes: Array.isArray(row.alertes) ? (row.alertes as string[]) : [],
    ttfb_ms: num(row.ttfb_ms),
    chargement_ms: num(row.chargement_ms),
    poids_octets: num(row.poids_octets),
    capture_url: str(row.capture_url),
    note_globale_demo: num(row.note_globale_demo),
    analyse_le: str(row.analyse_le),
    psi_performance: num(row.psi_performance),
    psi_recupere_le: str(row.psi_recupere_le),
  };
}

/**
 * Les preuves de l'axe vitesse quand c'est Google qui mesure : les Core Web
 * Vitals, que notre analyseur ne voit pas. Les seuils sont ceux de Google —
 * les reprendre plutôt que d'en inventer, c'est ce qui rend la ligne
 * vérifiable par le prospect s'il fait le test lui-même.
 */
function preuvesPsi(row: Record<string, unknown>): Preuve[] {
  const out: Preuve[] = [];
  const lcp = num(row.psi_lcp_ms);
  const cls = num(row.psi_cls);
  const tbt = num(row.psi_tbt_ms);

  if (lcp != null) {
    out.push({
      cle: "psi_lcp",
      libelle: "Affichage du contenu principal",
      valeur: `${(lcp / 1000).toFixed(1).replace(".", ",")} s`,
      seuil: "2,5 s",
      poids: 40,
      verdict: lcp <= 2500 ? "ok" : lcp <= 4000 ? "moyen" : "probleme",
    });
  }
  if (cls != null) {
    out.push({
      cle: "psi_cls",
      libelle: "Stabilité de la mise en page",
      valeur: cls.toFixed(2).replace(".", ","),
      seuil: "0,10",
      poids: 25,
      verdict: cls <= 0.1 ? "ok" : cls <= 0.25 ? "moyen" : "probleme",
    });
  }
  if (tbt != null) {
    out.push({
      cle: "psi_tbt",
      libelle: "Temps où la page ne répond pas",
      valeur: `${Math.round(tbt)} ms`,
      seuil: "200 ms",
      poids: 35,
      verdict: tbt <= 200 ? "ok" : tbt <= 600 ? "moyen" : "probleme",
    });
  }
  return out;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
