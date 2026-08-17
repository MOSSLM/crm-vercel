import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collecter } from "./collect";
import { analyser } from "./analyze";
import { scorer } from "./score";
import type { AxeId, ContexteEntreprise, ResultatScore, SignauxSite } from "./types";

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
  // ── Contexte du pilier « popularité locale » ────────────────────────────
  // Fourni par la vue depuis `sql/20260811_audit_popularite.sql`. Absent tant
  // que la migration n'est pas appliquée : les preuves correspondantes restent
  // alors « inconnues », donc hors dénominateur, et rien ne casse.
  nom?: string | null;
  ville?: string | null;
  note_moyenne?: number | null;
  qualifications_rge?: string[] | null;
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
  /**
   * Ce que `detail` contient et que l'analyseur ne reproduira pas, par
   * entreprise. Rempli une fois pour tout le lot ; voir `chargerDetailConserve`.
   */
  detailConserve?: Map<number, Record<string, unknown>>;
}

/**
 * Les axes que l'analyseur écrit lui-même à chaque passage.
 *
 * Tout ce qui n'est PAS dans cette liste vient d'ailleurs et doit survivre à une
 * ré-analyse. Définir la frontière par ce que l'analyseur produit — plutôt que
 * d'énumérer les clés étrangères — fait que le prochain producteur de données
 * est protégé sans qu'on ait à y penser.
 */
const CLES_ANALYSEUR: ReadonlySet<string> = new Set<AxeId>([
  "vitesse",
  "seo",
  "mobile",
  "conversion",
  "popularite",
]);

/**
 * Ce qui est déjà stocké dans `detail` et que l'analyseur ne sait pas refaire.
 *
 * `ecrire` réécrit `detail` en entier — c'est ce qui garantit qu'une analyse ne
 * laisse pas traîner les preuves de la précédente. Mais deux clés n'y sont pas
 * produites par l'analyseur : `google`, qui vient d'un appel PageSpeed payé en
 * quota et en quarante secondes d'attente, et `observations`, relevées à la main
 * par l'agent qui prépare l'audit. Sans cette reconduction, le premier passage
 * du cron effacerait silencieusement l'une et l'autre sur un prospect en cours
 * de démarchage — et personne ne s'en apercevrait avant le rendez-vous.
 *
 * Une seule requête par lot. Un échec ne lève pas : on rend une table vide, et
 * la reconduction ne se fait simplement pas.
 */
export async function chargerDetailConserve(
  sb: SupabaseClient,
  entrepriseIds: number[],
): Promise<Map<number, Record<string, unknown>>> {
  const out = new Map<number, Record<string, unknown>>();
  if (entrepriseIds.length === 0) return out;

  const { data, error } = await sb
    .from("entreprises_audit_site")
    .select("entreprise_id, detail")
    .in("entreprise_id", entrepriseIds);

  if (error) return out;

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const detail = (row.detail ?? {}) as Record<string, unknown>;
    const etranger = Object.fromEntries(
      Object.entries(detail).filter(([cle, v]) => !CLES_ANALYSEUR.has(cle) && v != null),
    );
    if (Object.keys(etranger).length > 0) out.set(Number(row.entreprise_id), etranger);
  }
  return out;
}

/** Le contexte CRM que la page ne peut pas contenir, tel que la vue le donne. */
function contexteDe(cible: CibleAudit): ContexteEntreprise {
  return {
    nombreAvis: cible.nombre_avis ?? null,
    telephone: cible.telephone ?? null,
    noteMoyenne: cible.note_moyenne ?? null,
    ville: cible.ville ?? null,
    nom: cible.nom ?? null,
    qualificationsRge: cible.qualifications_rge ?? null,
  };
}

/**
 * Les signaux d'une entreprise sans site : tout est inconnu du côté de la page.
 *
 * Ce n'est pas un site noté zéro — c'est un site qu'on n'a pas. Les quatre axes
 * qui mesurent la page tombent donc en confiance faible et ne sont pas publiés,
 * et seul l'axe popularité, qui ne dépend pas de la page, a quelque chose à dire.
 */
function signauxSansSite(): SignauxSite {
  return {
    joignable: false,
    bloque: false,
    httpStatus: null,
    https: false,
    ttfbMs: null,
    chargementMs: null,
    poidsOctets: null,
    poidsTotalOctets: null,
    compression: false,
    cacheControl: false,
    longueurTexteVisible: 0,
    nbScripts: 0,
    nbScriptsBloquants: 0,
    nbCssBloquants: 0,
    ressembleSpa: false,
    coquille: false,
    pageParking: false,
    title: null,
    metaDescription: null,
    nbH1: 0,
    canonical: false,
    lang: null,
    noindex: false,
    robotsTxt: null,
    sitemapXml: null,
    nbPagesSitemap: null,
    jsonLdLocalBusiness: false,
    napNom: false,
    napAdresse: false,
    napTelephone: false,
    nbImages: 0,
    nbImagesSansAlt: 0,
    nbImagesSansLazy: 0,
    viewport: false,
    viewportZoomBloque: false,
    nbMediaQueries: null,
    nbLargeursFixes: 0,
    nbPolicesTropPetites: null,
    cssLisible: false,
    telCliquable: false,
    telephoneEnTexte: false,
    formulaire: false,
    mailto: false,
    avisDansLaPage: false,
    widgetAvis: null,
    mentionsLegales: false,
    bandeauCookies: false,
    nbReseauxSociaux: 0,
    nbCta: 0,
    villeDansTitre: null,
    mentionneRge: null,
    cms: null,
    cmsVersion: null,
    theme: null,
    constructeur: null,
    generateurBrut: null,
    derniereModifDetecteeLe: null,
    sourceDerniereModif: null,
    waybackPremiereCaptureLe: null,
  };
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
  // `*` plutôt que la liste des colonnes : la vue gagne des champs avec la
  // migration du pilier popularité, et un `select` qui NOMME une colonne absente
  // échoue entièrement. Ici, une vue plus ancienne rend simplement moins.
  const { data, error } = await sb
    .from("v_audit_site_a_rafraichir")
    .select("*")
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

  // Le lot fournit la table ; l'analyse à l'unité, déclenchée à la main, la
  // reconstitue pour elle seule.
  const detailConserve =
    (opts.detailConserve ?? (await chargerDetailConserve(sb, [cible.entreprise_id]))).get(
      cible.entreprise_id,
    ) ?? null;

  // Pas d'URL du tout : c'est un résultat, et l'un des plus vendables du parc.
  // On l'enregistre plutôt que de sauter la ligne, sinon la même entreprise
  // revient dans la file à chaque tick sans jamais rien produire.
  if (!url) {
    // Pas de site à mesurer, mais une fiche Google à auditer : ces entreprises
    // sont le quart du parc et les plus faciles à convaincre. Leur écrire une
    // ligne vide reviendrait à n'avoir rien à leur dire.
    const contexte = contexteDe(cible);
    const score = scorer(signauxSansSite(), contexte);
    const cles = ["no_site_or_unreachable", ...score.issueKeys.filter((k) => k !== "no_site_or_unreachable")];

    await ecrire(sb, cible, score, cles, maintenant, opts, {
      injoignable: true,
      erreur: "aucune URL renseignée",
      detailConserve,
    });
    return {
      entreprise_id: cible.entreprise_id,
      statut: "injoignable",
      note_globale: null,
      issue_keys: cles,
    };
  }

  try {
    const collecte = await collecter(url);
    const contexte = contexteDe(cible);
    const signaux = analyser(collecte, contexte);
    const score = scorer(signaux, contexte);

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
      detailConserve,
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
    await ecrire(sb, cible, null, [], maintenant, opts, {
      erreur: message,
      incrementer: true,
      detailConserve,
    });
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

  // Une requête pour tout le lot, avant de commencer : à l'intérieur de la
  // boucle, chaque aller-retour se paierait sur le budget de 45 s.
  const options: OptionsAudit = {
    ...opts,
    detailConserve:
      opts.detailConserve ?? (await chargerDetailConserve(sb, cibles.map((c) => c.entreprise_id))),
  };

  for (const [i, cible] of cibles.entries()) {
    if (Date.now() - debut > budget) return { traitees, reste: cibles.length - i };
    traitees.push(await analyserEntreprise(sb, cible, options));
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
  /** Constats PageSpeed à reconduire dans `detail.google`. */
  detailConserve?: Record<string, unknown> | null;
};

/** Le `detail` complet : les preuves par axe, plus `google` s'il y en a. */
function detailDe(
  axes: Record<AxeId, { preuves: unknown }> | undefined,
  conserve: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = axes
    ? Object.fromEntries((Object.keys(axes) as AxeId[]).map((id) => [id, axes[id].preuves]))
    : {};
  // Les clés étrangères d'abord écrasées par les nôtres serait un bug muet :
  // l'analyseur ne produit jamais ces clés-là, donc l'ordre est sans danger,
  // mais on l'écrit dans ce sens pour que ça reste vrai si la liste change.
  Object.assign(out, conserve ?? {});
  return Object.keys(out).length > 0 ? out : null;
}

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
    // Les preuves des cinq axes, plus les constats Google reconduits. `null`
    // seulement quand il n'y a réellement rien : une analyse en échec ne doit pas
    // emporter une mesure PageSpeed qui, elle, reste valable.
    detail: detailDe(axes, extra.detailConserve),
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
