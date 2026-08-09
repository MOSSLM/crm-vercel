import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxeId, Confiance, Preuve } from "./types";
import { libelleDeNote } from "./score";

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

const AXES: AxeId[] = ["vitesse", "seo", "mobile", "conversion"];

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
  const detail = (row.detail ?? {}) as Partial<Record<AxeId, Preuve[]>>;
  const confiance = (row.confiance ?? {}) as Partial<Record<AxeId, Confiance>>;
  const noteParAxe: Record<AxeId, number | null> = {
    vitesse: num(row.note_vitesse),
    seo: num(row.note_seo),
    mobile: num(row.note_mobile),
    conversion: num(row.note_conversion),
  };

  const axes: AxePublie[] = [];
  const masques: AxeId[] = [];

  for (const id of AXES) {
    const note = noteParAxe[id];
    const conf = confiance[id] ?? "faible";
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
      preuves: (detail[id] ?? []).filter((p) => p.verdict !== "inconnu" && p.valeur !== null),
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

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
