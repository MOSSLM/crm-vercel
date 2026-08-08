/**
 * Résolution d'identité : proposer des SIRET, ne jamais en choisir un.
 *
 * Le contrat de ce module tient en une phrase : il ÉCRIT dans
 * `entreprise_siret_candidats`, jamais dans `entreprises.siret`. Le passage de
 * l'un à l'autre demande une validation humaine explicite
 * (`validerCandidat`), et c'est la seule porte.
 *
 * Pourquoi cette rigidité : un rapprochement faux n'est pas une donnée fausse
 * isolée, c'est une CONTAMINATION. Le mauvais SIRET amène ensuite la mauvaise
 * identité, les mauvaises finances, et surtout les mauvaises qualifications
 * RGE — qui finissent en logos sur un site public qu'on produit. C'est
 * exactement l'allégation trompeuse que le contrôle ADEME était censé éviter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  searchByName,
  fetchIdentite,
  etablissementsCandidats,
  type CandidatEtablissement,
} from "./recherche-entreprises";
import {
  classer,
  variantesDeRecherche,
  SEUIL_PROPOSITION,
  type CandidatScore,
  type FicheARapprocher,
} from "./score";
import { normalizeSiren, normalizeSiret } from "./siret";

export type FicheAResoudre = {
  entreprise_id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  /** SIREN déjà connu (extrait d'une note, par exemple) : raccourci décisif. */
  siren_connu?: string | null;
  siret_connu?: string | null;
};

export type OptionsResolution = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  maxCandidats?: number;
};

/**
 * Cherche des candidats pour une fiche.
 *
 * TROIS CHEMINS, du plus sûr au plus incertain :
 *
 * 1. Un SIRET connu → on le vérifie et c'est fini. Aucun jugement.
 * 2. Un SIREN connu (typiquement extrait d'une note écrite par un humain qui
 *    avait consulté le registre) → on déplie ses établissements et on les
 *    propose. Il reste un choix à faire : LEQUEL des établissements ? C'est le
 *    piège CLIMIZ, dont le siège est dans un autre arrondissement que
 *    l'activité.
 * 3. Rien → recherche par nom, avec élargissement progressif. C'est le cas
 *    difficile : « CLIMIZ » et « Eco Solutions 44 » rendent tous deux 0
 *    résultat sur l'API, mesuré.
 */
export const chercherCandidats = async (
  fiche: FicheAResoudre,
  opts: OptionsResolution = {},
): Promise<CandidatScore[]> => {
  const aRapprocher: FicheARapprocher = {
    nom: fiche.name ?? "",
    ville: fiche.ville,
    codePostal: fiche.code_postal,
  };

  // ── Chemin 1 : SIRET déjà connu.
  const siretConnu = normalizeSiret(fiche.siret_connu);
  if (siretConnu) {
    const id = await fetchIdentite(siretConnu, opts);
    if (id) {
      const candidat: CandidatEtablissement = {
        identite: id,
        siret: siretConnu,
        estSiege: true,
        adresse: id.adresseSiege,
        codePostal: id.codePostalSiege,
        ville: id.villeSiege,
        enseignes: id.enseignes,
        etatAdministratif: id.etatAdministratif,
      };
      return classer(aRapprocher, [candidat]);
    }
  }

  // ── Chemin 2 : SIREN connu, il reste à choisir l'établissement.
  const sirenConnu = normalizeSiren(fiche.siren_connu);
  if (sirenConnu) {
    const id = await fetchIdentite(sirenConnu, opts);
    if (id?.siret) {
      const candidat: CandidatEtablissement = {
        identite: id,
        siret: id.siret,
        estSiege: true,
        adresse: id.adresseSiege,
        codePostal: id.codePostalSiege,
        ville: id.villeSiege,
        enseignes: id.enseignes,
        etatAdministratif: id.etatAdministratif,
      };
      return classer(aRapprocher, [candidat]);
    }
  }

  // ── Chemin 3 : recherche par nom.
  if (!fiche.name) return [];

  const variantes = variantesDeRecherche(fiche.name, fiche.ville);
  const trouves: CandidatEtablissement[] = [];

  for (const variante of variantes) {
    // Le code postal d'abord : c'est le filtre qui évite de noyer un bon
    // résultat sous les homonymes nationaux. On le relâche seulement si la
    // requête filtrée ne rend rien.
    for (const cp of [fiche.code_postal, null]) {
      const res = await searchByName(variante, { ...opts, codePostal: cp, limit: 10 });
      trouves.push(...res);
      if (res.length > 0) break;
    }
    // On s'arrête dès qu'une variante a produit quelque chose : les variantes
    // suivantes sont plus larges, donc plus bruyantes.
    if (trouves.length > 0) break;
  }

  return classer(aRapprocher, trouves)
    .filter((c) => c.score >= SEUIL_PROPOSITION)
    .slice(0, opts.maxCandidats ?? 5);
};

/**
 * Enregistre les propositions, sans rien décider.
 *
 * Les candidats déjà tranchés (validés ou rejetés) ne sont PAS réécrits : une
 * décision humaine ne se fait pas effacer par un passage automatique.
 */
export const enregistrerCandidats = async (
  sb: SupabaseClient,
  entrepriseId: number,
  candidats: CandidatScore[],
): Promise<number> => {
  if (candidats.length === 0) return 0;

  const { data: dejaTranches } = await sb
    .from("entreprise_siret_candidats")
    .select("siret")
    .eq("entreprise_id", entrepriseId)
    .in("statut", ["valide", "rejete"]);

  const intouchables = new Set(((dejaTranches ?? []) as Array<{ siret: string }>).map((r) => r.siret));

  const lignes = candidats
    .filter((c) => !intouchables.has(c.candidat.siret))
    .map((c, i) => ({
      entreprise_id: entrepriseId,
      siret: c.candidat.siret,
      siren: c.candidat.siret.slice(0, 9),
      denomination: c.candidat.identite.denomination,
      enseignes: c.candidat.enseignes.length > 0 ? c.candidat.enseignes : c.candidat.identite.enseignes,
      adresse: c.candidat.adresse,
      code_postal: c.candidat.codePostal,
      ville: c.candidat.ville,
      etat_administratif: c.candidat.etatAdministratif ?? c.candidat.identite.etatAdministratif,
      naf_code: c.candidat.identite.nafCode,
      score: c.score,
      score_detail: c.detail,
      rang: i + 1,
      statut: "propose" as const,
    }));

  if (lignes.length === 0) return 0;

  const { error } = await sb
    .from("entreprise_siret_candidats")
    .upsert(lignes, { onConflict: "entreprise_id,siret" });
  if (error) throw new Error(`enregistrerCandidats: ${error.message}`);
  return lignes.length;
};

/**
 * LA porte. Un candidat validé devient le SIRET de la fiche.
 *
 * Écrit `entreprises.siret` — la seule écriture de tout ce socle qui touche
 * `entreprises`, et elle exige un `decide_par` : on veut pouvoir dire QUI a
 * tranché, des mois plus tard, devant une fiche qui s'avère fausse.
 */
export const validerCandidat = async (
  sb: SupabaseClient,
  params: { entreprise_id: number; siret: string; decide_par: string; commentaire?: string },
): Promise<{ ok: true } | { ok: false; erreur: string }> => {
  const siret = normalizeSiret(params.siret);
  if (!siret) return { ok: false, erreur: "siret_invalide" };

  const maintenant = new Date().toISOString();

  const { error: errCandidat } = await sb
    .from("entreprise_siret_candidats")
    .update({
      statut: "valide",
      decide_le: maintenant,
      decide_par: params.decide_par,
      commentaire: params.commentaire ?? null,
    })
    .eq("entreprise_id", params.entreprise_id)
    .eq("siret", siret);
  if (errCandidat) return { ok: false, erreur: errCandidat.message };

  // Les autres candidats de la même fiche sont rejetés : laisser deux « propose »
  // après une décision, c'est reproposer indéfiniment un choix déjà fait.
  await sb
    .from("entreprise_siret_candidats")
    .update({ statut: "rejete", decide_le: maintenant, decide_par: params.decide_par })
    .eq("entreprise_id", params.entreprise_id)
    .neq("siret", siret)
    .eq("statut", "propose");

  const { error } = await sb
    .from("entreprises")
    .update({
      siret,
      siren: siret.slice(0, 9),
      siret_source: "resolution",
      siret_confirme_le: maintenant,
      siret_confirme_par: params.decide_par,
    })
    .eq("id", params.entreprise_id);

  if (error) {
    // L'index unique partiel sur `siret` fait de ce cas un vrai garde-fou :
    // deux fiches sur le même SIRET sont un doublon, et le dire ici évite de le
    // découvrir en démo.
    return {
      ok: false,
      erreur: error.message.includes("entreprises_siret_unique_actif")
        ? "siret_deja_attribue_a_une_autre_fiche"
        : error.message,
    };
  }

  return { ok: true };
};

/** Rejette un candidat, avec sa raison. */
export const rejeterCandidat = async (
  sb: SupabaseClient,
  params: { entreprise_id: number; siret: string; decide_par: string; commentaire?: string },
): Promise<void> => {
  await sb
    .from("entreprise_siret_candidats")
    .update({
      statut: "rejete",
      decide_le: new Date().toISOString(),
      decide_par: params.decide_par,
      commentaire: params.commentaire ?? null,
    })
    .eq("entreprise_id", params.entreprise_id)
    .eq("siret", params.siret);
};

/**
 * Extrait un SIREN/SIRET d'une note écrite à la main.
 *
 * Les 41 SIREN déjà trouvés vivent uniquement là, dans des phrases comme
 * « Confirmé au registre : SIREN 914827035 / SIRET 91482703500017 ». Ils ont
 * été posés par un humain qui avait le registre sous les yeux : ce sont les
 * meilleurs candidats du parc, et il serait absurde de les rechercher à
 * nouveau.
 *
 * On ne prend QUE des numéros explicitement étiquetés. Un nombre à 9 chiffres
 * qui traîne dans une note peut être un numéro de téléphone, un montant ou une
 * référence.
 */
export const extraireIdentifiants = (
  note: string | null | undefined,
): { siret: string | null; siren: string | null } => {
  if (!note) return { siret: null, siren: null };

  const siretMatch = note.match(/SIRET\s*:?\s*([\d\s.]{14,20})/i);
  const sirenMatch = note.match(/SIREN\s*:?\s*([\d\s.]{9,13})/i);

  return {
    siret: siretMatch ? normalizeSiret(siretMatch[1]) : null,
    siren: sirenMatch ? normalizeSiren(sirenMatch[1]) : null,
  };
};
