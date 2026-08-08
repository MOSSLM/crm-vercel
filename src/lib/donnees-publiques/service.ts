/**
 * Hydratation : SIRET → identité, taille, finances, qualifications RGE.
 *
 * Déterministe et sans LLM. Une fois le SIRET connu et vérifié, il n'y a plus
 * aucun jugement à porter : faire tourner un modèle sur du JSON structuré
 * serait plus lent, plus cher et MOINS fiable qu'un `fetch`.
 *
 * TROIS PROPRIÉTÉS QU'ON TIENT ICI
 *
 * 1. Idempotence. Rejouer un passage ne change rien : les données publiques
 *    sont écrasées par les mêmes valeurs, et les qualifications sont
 *    rapprochées sur une clé naturelle stable.
 * 2. Aucune écriture hors de son périmètre. Tout ce que cette fonction écrit
 *    vit dans `entreprises_donnees_publiques` et
 *    `entreprise_rge_qualifications`. Elle ne touche NI `entreprises`, NI
 *    `lead_magnet_projects`, donc ni le saisi humain ni les colonnes
 *    `stat_*_official`.
 * 3. Cadences séparées. Le RGE bouge quotidiennement, les comptes une fois
 *    l'an : les deux sources sont interrogées indépendamment, et une source en
 *    panne n'empêche pas l'autre de se rafraîchir.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchQualifications, type QualificationRge } from "./ademe-rge";
import { fetchIdentite, type IdentiteEntreprise } from "./recherche-entreprises";
import { normalizeSiret } from "./siret";

export type Declencheur = "bouton" | "cron" | "backfill";

export type CibleHydratation = {
  entreprise_id: number;
  siret: string | null;
  siren?: string | null;
  identite_due?: boolean;
  rge_due?: boolean;
};

export type ResultatHydratation = {
  entreprise_id: number;
  identite: "ok" | "vide" | "erreur" | "ignore";
  rge: "ok" | "vide" | "erreur" | "ignore";
  champs_ecrits: number;
  rge_ajoutees: number;
  rge_retirees: number;
  erreurs: string[];
};

export type OptionsHydratation = {
  declencheur?: Declencheur;
  /** Forcer le rafraîchissement même si les TTL ne sont pas dépassés (bouton). */
  forcer?: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Horloge injectable, pour que les tests n'aient pas à composer avec `now()`. */
  maintenant?: () => Date;
};

/** Les colonnes de `entreprises_donnees_publiques`, depuis une identité normalisée. */
const versLigne = (entrepriseId: number, siret: string, id: IdentiteEntreprise, now: string) => ({
  entreprise_id: entrepriseId,
  denomination: id.denomination,
  nom_complet: id.nomComplet,
  sigle: id.sigle,
  enseignes: id.enseignes,
  date_creation: id.dateCreation,
  date_creation_etablissement: id.dateCreationEtablissement,
  date_fermeture: id.dateFermeture,
  etat_administratif: id.etatAdministratif,
  naf_code: id.nafCode,
  naf_code_2025: id.nafCode2025,
  naf_section: id.nafSection,
  nature_juridique: id.natureJuridique,
  categorie_entreprise: id.categorieEntreprise,
  categorie_entreprise_annee: id.categorieEntrepriseAnnee,
  tranche_effectif_code: id.trancheEffectifCode,
  tranche_effectif_annee: id.trancheEffectifAnnee,
  est_employeur: id.estEmployeur,
  nb_etablissements: id.nbEtablissements,
  nb_etablissements_ouverts: id.nbEtablissementsOuverts,
  // `parseFinances` a déjà transformé `ca: 0` en null ; la contrainte en base
  // est la seconde barrière.
  chiffre_affaires: id.chiffreAffaires,
  resultat_net: id.resultatNet,
  exercice_annee: id.exerciceAnnee,
  finances_historique: id.financesHistorique,
  dirigeants: id.dirigeants,
  tva_intracommunautaire: id.tvaIntracommunautaire,
  idcc: id.idcc,
  est_rge_indicatif: id.estRgeIndicatif,
  complements: id.complements,
  adresse_siege: id.adresseSiege,
  code_postal_siege: id.codePostalSiege,
  ville_siege: id.villeSiege,
  commune_insee: id.communeInsee,
  lat_siege: id.latSiege,
  lng_siege: id.lngSiege,
  siret_interroge: siret,
  identite_rafraichie_le: now,
  // Les finances arrivent dans la MÊME réponse que l'identité : les marquer
  // fraîches ici ne coûte pas un appel de plus. Leur TTL propre (un an) ne sert
  // donc pas à déclencher un appel, mais à décider si un CA affiché est encore
  // présentable comme « à jour ».
  finances_rafraichies_le: now,
  source_maj_le: id.sourceMajLe,
  identite_erreur: null as string | null,
});

/**
 * Rafraîchit l'identité d'une entreprise.
 *
 * Une absence de résultat n'est PAS une erreur : un SIRET radié depuis
 * longtemps peut ne plus rien rendre. On l'enregistre comme 'vide' pour que le
 * journal distingue « l'API n'a rien » de « l'API a échoué » — sans quoi on ne
 * saurait pas s'il faut réessayer.
 */
export const hydraterIdentite = async (
  sb: SupabaseClient,
  cible: CibleHydratation,
  opts: OptionsHydratation = {},
): Promise<{ statut: "ok" | "vide" | "erreur"; champs: number; message?: string }> => {
  const siret = normalizeSiret(cible.siret);
  if (!siret) return { statut: "erreur", champs: 0, message: "siret_invalide" };

  const now = (opts.maintenant?.() ?? new Date()).toISOString();

  let identite: IdentiteEntreprise | null;
  try {
    identite = await fetchIdentite(siret, { fetchImpl: opts.fetchImpl, signal: opts.signal });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // L'échec est mémorisé DANS la ligne, pas seulement dans le journal : la
    // fiche doit pouvoir montrer « dernière tentative en erreur » sans avoir à
    // fouiller un journal.
    await sb
      .from("entreprises_donnees_publiques")
      .upsert({ entreprise_id: cible.entreprise_id, identite_erreur: message }, { onConflict: "entreprise_id" });
    return { statut: "erreur", champs: 0, message };
  }

  if (!identite) {
    await sb.from("entreprises_donnees_publiques").upsert(
      { entreprise_id: cible.entreprise_id, identite_rafraichie_le: now, identite_erreur: null },
      { onConflict: "entreprise_id" },
    );
    return { statut: "vide", champs: 0, message: "aucun_resultat" };
  }

  const ligne = versLigne(cible.entreprise_id, siret, identite, now);
  const { error } = await sb
    .from("entreprises_donnees_publiques")
    .upsert(ligne, { onConflict: "entreprise_id" });
  if (error) return { statut: "erreur", champs: 0, message: error.message };

  // On compte les champs réellement porteurs d'information, pas les colonnes
  // écrites : « 34 champs écrits » dont 30 à null ne dit rien.
  const champs = Object.entries(ligne).filter(
    ([k, v]) =>
      !["entreprise_id", "siret_interroge", "identite_rafraichie_le", "finances_rafraichies_le", "identite_erreur"].includes(k) &&
      v !== null &&
      v !== undefined &&
      !(Array.isArray(v) && v.length === 0) &&
      !(typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0),
  ).length;

  return { statut: "ok", champs };
};

/**
 * Rafraîchit les qualifications RGE.
 *
 * LE POINT DÉLICAT : la disparition. Une qualification retirée n'apparaît plus
 * dans le jeu ADEME. Si on se contentait d'insérer ce qu'on voit, une
 * qualification perdue resterait affichée pour toujours — et un logo RGE non
 * détenu sur un site public est une allégation trompeuse.
 *
 * D'où le rapprochement complet : ce qui est vu est marqué vu, ce qui n'est
 * plus vu est marqué retiré. Jamais supprimé : savoir qu'une entreprise a PERDU
 * sa qualification est un renseignement, et l'historique sert l'appel.
 */
export const hydraterRge = async (
  sb: SupabaseClient,
  cible: CibleHydratation,
  opts: OptionsHydratation = {},
): Promise<{ statut: "ok" | "vide" | "erreur"; ajoutees: number; retirees: number; message?: string }> => {
  const siret = normalizeSiret(cible.siret);
  if (!siret) return { statut: "erreur", ajoutees: 0, retirees: 0, message: "siret_invalide" };

  const nowDate = opts.maintenant?.() ?? new Date();
  const now = nowDate.toISOString();

  let qualifications: QualificationRge[];
  try {
    // `tousEtablissements` par défaut : le joker SIREN trouve les
    // qualifications portées par un établissement secondaire, que la requête
    // sur le seul SIRET du siège manquerait.
    const res = await fetchQualifications(siret, {
      fetchImpl: opts.fetchImpl,
      signal: opts.signal,
      tousEtablissements: true,
    });
    qualifications = res.qualifications;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sb
      .from("entreprises_donnees_publiques")
      .upsert({ entreprise_id: cible.entreprise_id, rge_erreur: message }, { onConflict: "entreprise_id" });
    return { statut: "erreur", ajoutees: 0, retirees: 0, message };
  }

  let ajoutees = 0;
  if (qualifications.length > 0) {
    const lignes = qualifications.map((q) => ({
      entreprise_id: cible.entreprise_id,
      siret: q.siret,
      code_qualification: q.codeQualification,
      nom_certificat: q.nomCertificat,
      nom_qualification: q.nomQualification,
      organisme: q.organisme,
      domaine: q.domaine,
      meta_domaine: q.metaDomaine,
      particulier: q.particulier,
      url_qualification: q.urlQualification,
      date_debut: q.dateDebut,
      date_fin: q.dateFin,
      derniere_vue_le: now,
      // Une qualification qui réapparaît après un retrait est de nouveau
      // active : on lève le drapeau plutôt que de laisser une ligne morte.
      retiree_le: null as string | null,
    }));

    const { error } = await sb
      .from("entreprise_rge_qualifications")
      .upsert(lignes, { onConflict: "entreprise_id,siret,code_qualification,date_debut" });
    if (error) return { statut: "erreur", ajoutees: 0, retirees: 0, message: error.message };
    ajoutees = lignes.length;
  }

  // Rapprochement : tout ce qui n'a pas été revu à ce passage est retiré.
  const { data: retirees, error: errRetrait } = await sb
    .from("entreprise_rge_qualifications")
    .update({ retiree_le: now })
    .eq("entreprise_id", cible.entreprise_id)
    .is("retiree_le", null)
    .lt("derniere_vue_le", now)
    .select("id");
  if (errRetrait) return { statut: "erreur", ajoutees, retirees: 0, message: errRetrait.message };

  await sb
    .from("entreprises_donnees_publiques")
    .upsert(
      { entreprise_id: cible.entreprise_id, rge_rafraichi_le: now, rge_erreur: null },
      { onConflict: "entreprise_id" },
    );

  return {
    statut: qualifications.length > 0 ? "ok" : "vide",
    ajoutees,
    retirees: retirees?.length ?? 0,
  };
};

/** Écrit une ligne de journal. Best-effort : un journal en panne n'arrête pas le travail. */
const journaliser = async (
  sb: SupabaseClient,
  ligne: Record<string, unknown>,
): Promise<void> => {
  try {
    await sb.from("donnees_publiques_runs").insert(ligne);
  } catch {
    // Volontairement muet : le journal sert le diagnostic, il ne commande pas.
  }
};

/**
 * Hydrate UNE entreprise, les deux sources.
 *
 * Les deux sources sont indépendantes : l'ADEME peut répondre alors que
 * `recherche-entreprises` est en panne, et il n'y a aucune raison de perdre
 * l'une parce que l'autre a échoué.
 */
export const hydraterEntreprise = async (
  sb: SupabaseClient,
  cible: CibleHydratation,
  opts: OptionsHydratation = {},
): Promise<ResultatHydratation> => {
  const declencheur = opts.declencheur ?? "cron";
  const forcer = opts.forcer ?? false;
  const res: ResultatHydratation = {
    entreprise_id: cible.entreprise_id,
    identite: "ignore",
    rge: "ignore",
    champs_ecrits: 0,
    rge_ajoutees: 0,
    rge_retirees: 0,
    erreurs: [],
  };

  if (!normalizeSiret(cible.siret)) {
    await journaliser(sb, {
      entreprise_id: cible.entreprise_id,
      source: "recherche_entreprises",
      declencheur,
      statut: "ignore",
      motif: "pas_de_siret",
      siret: cible.siret,
    });
    return res;
  }

  if (forcer || cible.identite_due !== false) {
    const t0 = Date.now();
    const r = await hydraterIdentite(sb, cible, opts);
    res.identite = r.statut;
    res.champs_ecrits = r.champs;
    if (r.message && r.statut === "erreur") res.erreurs.push(`identite: ${r.message}`);
    await journaliser(sb, {
      entreprise_id: cible.entreprise_id,
      source: "recherche_entreprises",
      declencheur,
      statut: r.statut,
      motif: r.statut === "ok" ? null : r.message,
      message: r.statut === "erreur" ? r.message : null,
      siret: cible.siret,
      champs_ecrits: r.champs,
      duree_ms: Date.now() - t0,
    });
  }

  if (forcer || cible.rge_due !== false) {
    const t0 = Date.now();
    const r = await hydraterRge(sb, cible, opts);
    res.rge = r.statut;
    res.rge_ajoutees = r.ajoutees;
    res.rge_retirees = r.retirees;
    if (r.message && r.statut === "erreur") res.erreurs.push(`rge: ${r.message}`);
    await journaliser(sb, {
      entreprise_id: cible.entreprise_id,
      source: "ademe_rge",
      declencheur,
      statut: r.statut,
      motif: r.statut === "ok" ? null : r.message ?? "aucune_qualification",
      message: r.statut === "erreur" ? r.message : null,
      siret: cible.siret,
      rge_ajoutees: r.ajoutees,
      rge_retirees: r.retirees,
      duree_ms: Date.now() - t0,
    });
  }

  return res;
};

/**
 * Les entreprises à rafraîchir, selon la vue qui porte la définition de
 * « périmé ». La définition vit en SQL et à un seul endroit : recopier le
 * `where` ici, c'est se condamner à le voir diverger.
 */
export const chargerCibles = async (
  sb: SupabaseClient,
  limite: number,
): Promise<CibleHydratation[]> => {
  const { data, error } = await sb
    .from("v_donnees_publiques_a_rafraichir")
    .select("entreprise_id, siret, siren, identite_due, rge_due")
    .or("identite_due.eq.true,rge_due.eq.true")
    // Les jamais vues d'abord : une fiche neuve ne doit pas attendre derrière la
    // revérification de routine de tout le parc.
    .order("rge_rafraichi_le", { ascending: true, nullsFirst: true })
    .limit(limite);

  if (error) throw new Error(`chargerCibles: ${error.message}`);
  return (data ?? []) as CibleHydratation[];
};

/**
 * Traite un lot, sous contrainte de temps.
 *
 * Le budget prime sur la taille du lot : mieux vaut rendre un résultat partiel
 * et un reste à faire qu'une 504 qui ne dit ni ce qui a été fait, ni où
 * reprendre. Le passage suivant reprendra naturellement — les plus périmées
 * d'abord.
 */
export const hydraterLot = async (
  sb: SupabaseClient,
  cibles: CibleHydratation[],
  opts: OptionsHydratation & { budgetMs?: number } = {},
): Promise<{ traitees: ResultatHydratation[]; reste: number }> => {
  const budget = opts.budgetMs ?? 45_000;
  const debut = Date.now();
  const traitees: ResultatHydratation[] = [];

  for (const [i, cible] of cibles.entries()) {
    if (Date.now() - debut > budget) {
      return { traitees, reste: cibles.length - i };
    }
    traitees.push(await hydraterEntreprise(sb, cible, opts));
  }

  return { traitees, reste: 0 };
};
