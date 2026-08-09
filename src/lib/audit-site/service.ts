import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collecter } from "./collect";
import { analyser } from "./analyze";
import { scorer } from "./score";
import type { AxeId, ResultatScore } from "./types";

/**
 * Le passage en masse : charger une file, analyser sous contrainte de temps,
 * écrire.
 *
 * Calqué sur `src/lib/donnees-publiques/service.ts`, et pour les mêmes trois
 * propriétés :
 *
 * 1. **Idempotence.** Rejouer un passage réécrit les mêmes valeurs.
 * 2. **Aucune écriture hors périmètre.** Tout ce qu'on écrit vit dans
 *    `entreprises_audit_site` (plus un miroir best-effort dans
 *    `lead_magnet_projects.variables`, pour les audits déjà rédigés). Ni
 *    `entreprises`, ni `sites`, ni le saisi humain.
 * 3. **Le budget prime sur la taille du lot.** Mieux vaut un résultat partiel
 *    qui dit où reprendre qu'une 504 muette.
 */

export type Declencheur = "bouton" | "cron" | "backfill";

export interface CibleAudit {
  entreprise_id: number;
  url: string | null;
  nombre_avis?: number | null;
  telephone?: string | null;
}

export interface ResultatAudit {
  entreprise_id: number;
  statut: "ok" | "injoignable" | "erreur" | "ignore";
  note_globale: number | null;
  issue_keys: string[];
  message?: string;
}

export interface OptionsAudit {
  declencheur?: Declencheur;
  budgetMs?: number;
  ttlJours?: number;
  maintenant?: () => Date;
}

/** Nombre d'entreprises analysables (file complète, avant découpe en lot). */
export async function compterCandidats(sb: SupabaseClient): Promise<number | null> {
  const { count, error } = await sb
    .from("v_audit_site_a_rafraichir")
    .select("entreprise_id", { count: "exact", head: true });
  return error ? null : (count ?? null);
}

/**
 * La file, dans l'ordre décidé par la vue : jamais analysées d'abord.
 * L'ordre vit en SQL pour que la règle de péremption ne soit écrite qu'une fois.
 */
export async function chargerCibles(sb: SupabaseClient, limite: number): Promise<CibleAudit[]> {
  const { data, error } = await sb
    .from("v_audit_site_a_rafraichir")
    .select("entreprise_id, url, nombre_avis, telephone")
    .limit(limite);

  if (error) throw new Error(`chargerCibles: ${error.message}`);
  return (data ?? []) as CibleAudit[];
}

/** Analyse une entreprise et écrit sa ligne. Ne lève jamais. */
export async function analyserEntreprise(
  sb: SupabaseClient,
  cible: CibleAudit,
  opts: OptionsAudit = {},
): Promise<ResultatAudit> {
  const maintenant = opts.maintenant?.() ?? new Date();
  const url = (cible.url ?? "").trim();

  // Pas d'URL du tout : c'est un résultat, et l'un des plus vendables du parc.
  // On l'enregistre plutôt que de sauter la ligne, sinon la même entreprise
  // revient dans la file à chaque tick sans jamais rien produire.
  if (!url) {
    await ecrire(sb, cible, null, ["no_site_or_unreachable"], maintenant, opts, {
      injoignable: true,
      erreur: "aucune URL renseignée",
    });
    return {
      entreprise_id: cible.entreprise_id,
      statut: "injoignable",
      note_globale: null,
      issue_keys: ["no_site_or_unreachable"],
    };
  }

  try {
    const collecte = await collecter(url);
    const signaux = analyser(collecte, { telephone: cible.telephone });
    const score = scorer(signaux, { nombreAvis: cible.nombre_avis });

    await ecrire(sb, cible, score, score.issueKeys, maintenant, opts, {
      urlAnalysee: url,
      urlFinale: collecte.urlFinale,
      httpStatus: collecte.httpStatus,
      bloque: collecte.bloque,
      injoignable: collecte.injoignable,
      erreur: collecte.erreur,
      ttfbMs: collecte.ttfbMs,
      chargementMs: collecte.chargementMs,
      poidsOctets: collecte.poidsOctets,
      signaux,
    });

    return {
      entreprise_id: cible.entreprise_id,
      statut: signaux.joignable ? "ok" : "injoignable",
      note_globale: signaux.joignable ? score.noteGlobale : null,
      issue_keys: score.issueKeys,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // L'échec est mémorisé DANS la ligne, pas seulement dans les logs : c'est
    // `tentatives` qui finit par sortir un domaine mort de la file.
    await ecrire(sb, cible, null, [], maintenant, opts, { erreur: message, incrementer: true });
    return { entreprise_id: cible.entreprise_id, statut: "erreur", note_globale: null, issue_keys: [], message };
  }
}

/** Traite un lot sous contrainte de temps ; rend le reste à faire. */
export async function analyserLot(
  sb: SupabaseClient,
  cibles: CibleAudit[],
  opts: OptionsAudit = {},
): Promise<{ traitees: ResultatAudit[]; reste: number }> {
  const budget = opts.budgetMs ?? 45_000;
  const debut = Date.now();
  const traitees: ResultatAudit[] = [];

  for (const [i, cible] of cibles.entries()) {
    if (Date.now() - debut > budget) return { traitees, reste: cibles.length - i };
    traitees.push(await analyserEntreprise(sb, cible, opts));
  }
  return { traitees, reste: 0 };
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

type Extra = {
  urlAnalysee?: string;
  urlFinale?: string | null;
  httpStatus?: number | null;
  bloque?: boolean;
  injoignable?: boolean;
  erreur?: string | null;
  ttfbMs?: number | null;
  chargementMs?: number | null;
  poidsOctets?: number | null;
  signaux?: unknown;
  incrementer?: boolean;
};

async function ecrire(
  sb: SupabaseClient,
  cible: CibleAudit,
  score: ResultatScore | null,
  issueKeys: string[],
  maintenant: Date,
  opts: OptionsAudit,
  extra: Extra,
): Promise<void> {
  const ttlJours = opts.ttlJours ?? 30;
  const expire = new Date(maintenant.getTime() + ttlJours * 24 * 3600 * 1000);

  const axes = score?.axes;
  const noteDe = (id: AxeId) => (axes ? axes[id].note : null);

  const ligne: Record<string, unknown> = {
    entreprise_id: cible.entreprise_id,
    url_analysee: extra.urlAnalysee ?? cible.url ?? null,
    url_finale: extra.urlFinale ?? null,
    http_status: extra.httpStatus ?? null,
    bloque: extra.bloque ?? false,
    injoignable: extra.injoignable ?? false,
    note_globale: score?.noteGlobale ?? null,
    note_vitesse: noteDe("vitesse"),
    note_seo: noteDe("seo"),
    note_mobile: noteDe("mobile"),
    note_conversion: noteDe("conversion"),
    detail: axes
      ? Object.fromEntries((Object.keys(axes) as AxeId[]).map((id) => [id, axes[id].preuves]))
      : null,
    confiance: axes
      ? Object.fromEntries((Object.keys(axes) as AxeId[]).map((id) => [id, axes[id].confiance]))
      : null,
    alertes: score?.alertes ?? [],
    signaux: extra.signaux ?? null,
    issue_keys: issueKeys,
    ttfb_ms: extra.ttfbMs ?? null,
    chargement_ms: extra.chargementMs ?? null,
    poids_octets: extra.poidsOctets ?? null,
    analyse_le: maintenant.toISOString(),
    expire_le: expire.toISOString(),
    derniere_erreur: extra.erreur ?? null,
    maj_le: maintenant.toISOString(),
    // Une analyse qui aboutit remet le compteur à zéro ; seuls les échecs
    // successifs finissent par sortir l'entreprise de la file.
    tentatives: extra.incrementer ? await tentativesPlusUn(sb, cible.entreprise_id) : 0,
  };

  const { error } = await sb
    .from("entreprises_audit_site")
    .upsert(ligne, { onConflict: "entreprise_id" });
  if (error) throw new Error(`ecrire: ${error.message}`);

  await miroirLeadMagnet(sb, cible.entreprise_id, issueKeys);
}

async function tentativesPlusUn(sb: SupabaseClient, entrepriseId: number): Promise<number> {
  const { data } = await sb
    .from("entreprises_audit_site")
    .select("tentatives")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  return ((data as { tentatives?: number } | null)?.tentatives ?? 0) + 1;
}

/**
 * Miroir dans `lead_magnet_projects.variables.audit_detected_issues`.
 *
 * La source de vérité est désormais `entreprises_audit_site.issue_keys`, et
 * `AuditWorkspace` la lit en premier. Ce miroir existe pour les audits déjà
 * ouverts ailleurs et pour tout code qui lirait encore l'ancien emplacement :
 * best-effort, jamais bloquant, jamais lu en premier.
 */
async function miroirLeadMagnet(
  sb: SupabaseClient,
  entrepriseId: number,
  issueKeys: string[],
): Promise<void> {
  if (issueKeys.length === 0) return;
  try {
    const { data } = await sb
      .from("lead_magnet_projects")
      .select("id, variables")
      .eq("entreprise_id", entrepriseId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const projet = data as { id: string; variables: Record<string, unknown> | null } | null;
    if (!projet) return;

    await sb
      .from("lead_magnet_projects")
      .update({ variables: { ...(projet.variables ?? {}), audit_detected_issues: issueKeys } })
      .eq("id", projet.id);
  } catch (e) {
    console.warn(
      `[audit-site] miroir lead_magnet ignoré (entreprise ${entrepriseId}) : ` +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}
