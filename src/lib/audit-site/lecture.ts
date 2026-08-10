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

export interface AxePublie {
  id: AxeId;
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
  axes_masques: AxeId[];
  issue_keys: string[];
  /**
   * Ce que Lighthouse relève, trié par gain. Vide quand aucune mesure Google n'a
   * été faite — ou quand elle a plus de trente jours : un constat périmé sur un
   * site refait entre-temps est une affirmation fausse, et une seule suffit à
   * discréditer le reste du rapport.
   */
  constats_google: ConstatGoogle[];
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

const AXES: AxeId[] = ["vitesse", "seo", "mobile", "conversion", "popularite"];

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
  const noteParAxe: Record<AxeId, number | null> = {
    vitesse: vitesseGoogle ? psiPerf : num(row.note_vitesse),
    seo: num(row.note_seo),
    mobile: num(row.note_mobile),
    conversion: num(row.note_conversion),
    popularite: noteDepuisPreuves(detail.popularite ?? []),
  };

  const axes: AxePublie[] = [];
  const masques: AxeId[] = [];

  for (const id of AXES) {
    const note = noteParAxe[id];
    // Une mesure Google est faite dans un vrai navigateur : elle est concluante
    // même là où notre analyse ne l'était pas (une SPA, typiquement).
    const conf = id === "vitesse" && vitesseGoogle ? "haute" : (confiance[id] ?? "faible");
    // La règle, à un seul endroit : sous le seuil de confiance, l'axe n'est pas
    // publié. Le griser reviendrait à publier le chiffre en le décorant.
    if (note == null || conf === "faible") {
      masques.push(id);
      continue;
    }
    axes.push({
      id,
      note,
      confiance: conf,
      preuves:
        id === "vitesse" && vitesseGoogle
          ? preuvesPsi(row)
          : (detail[id] ?? []).filter((p) => p.verdict !== "inconnu" && p.valeur !== null),
      ...(id === "vitesse" && vitesseGoogle ? { mesureGoogle: true } : {}),
    });
  }

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
