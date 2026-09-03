/**
 * Résolution d'identité : proposer des SIRET, ne jamais en choisir un.
 *
 * Le contrat de ce module tient en une phrase : `chercherCandidats` et
 * `enregistrerCandidats` ÉCRIVENT dans `entreprise_siret_candidats`, jamais
 * dans `entreprises.siret`. Le passage de l'un à l'autre a une seule porte,
 * `validerCandidat`, et elle réinterroge toujours le registre.
 *
 * Cette porte s'ouvre de DEUX façons, et la seconde est arrivée le 20/08 :
 *   · une validation humaine explicite, à l'écran ;
 *   · la règle des quatre critères du registre des bots — « adresse + code
 *     postal + nom + métier concordants » — quand un SEUL SIREN est candidat.
 *     `decide_par` vaut alors `null` et la source dit `resolution_auto` : on ne
 *     fait croire à personne qu'un humain a regardé.
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
  motsDeVoie,
  normaliserNom,
  similariteVoie,
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
  /** La voie. C'est le chemin 4, et c'est celui qui trouve quand le nom échoue. */
  adresse?: string | null;
  /** Le TEXTE des avis Google — ce qui nomme l'artisan derrière ses initiales. */
  avis?: string[] | null;
  /** SIREN déjà connu (extrait d'une note, par exemple) : raccourci décisif. */
  siren_connu?: string | null;
  siret_connu?: string | null;
};

/**
 * Au-delà de ce nombre d'entreprises distinctes au MÊME numéro de la MÊME voie,
 * l'adresse n'identifie plus personne : c'est une domiciliation, un centre
 * d'affaires ou une pépinière. Mesuré au 46C chemin du Moulin Carron à Dardilly
 * — trois sociétés sans rapport au même numéro, dont aucune n'est la fiche.
 *
 * Deux reste courant et légitime : un artisan y loge son entreprise et sa SCI.
 */
export const SEUIL_ADRESSE_PARTAGEE = 3;

/**
 * La requête d'adresse : le numéro, le type de voie et son nom. RIEN D'AUTRE.
 *
 * ── LES DEUX BOUTS QU'IL FAUT COUPER, ET POURQUOI ─────────────────────────
 * L'annuaire fait du plein texte en ET implicite : chaque mot en trop est une
 * chance de plus de ne rien rendre. Mesuré le 03/09/2026 sur la fiche 202 :
 *
 *   « 30 RUE DE CRACOVIE »                    → RUBIN LACAQUE, premier résultat
 *   « ZAE CAP NORD 30 RUE DE CRACOVIE »       → 0 résultat
 *   « 30 RUE DE CRACOVIE SAINT-APOLLINAIRE »  → 0 résultat
 *
 * En tête, le complément de localisation (ZAE, ZAC, résidence, bâtiment, chez)
 * n'est presque jamais dans l'immatriculation : on démarre au numéro. En queue,
 * la commune est un piège — le registre déclare cette entreprise à DIJON quand
 * la fiche dit Saint-Apollinaire, et la commune ajoutée à la requête l'efface.
 * Le code postal joue ce rôle bien mieux : il est un FILTRE serveur, qu'on
 * relâche à la tentative suivante s'il ne rend rien.
 *
 * ⚠️ LE NUMÉRO RESTE DANS LA REQUÊTE. Le retirer paraissait prudent — une
 * immatriculation en zone artisanale porte souvent le lieu-dit sans numéro —
 * et c'est le contraire : « JEAN BAPTISTE BIOT PERPIGNAN » rend 258 résultats
 * nationaux où CERELEC n'apparaît pas, « 823 RUE JEAN BAPTISTE BIOT » en rend
 * 11 dont CERELEC.
 *
 * Rend `null` quand il ne reste rien qui NOMME : « 5,0(11) » — une note Google
 * tombée dans la colonne adresse, fiche 913 — ne doit pas partir en requête.
 */
export const requeteDAdresse = (adresse: string | null | undefined): string | null => {
  if (!adresse) return null;
  // Sans un mot de voie, il n'y a pas d'adresse : que des chiffres, ou du bruit.
  if (motsDeVoie(adresse).length === 0) return null;

  const mots = normaliserNom(adresse)
    .replace(/\b\d{5}\b.*$/, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  // On démarre au numéro ; à défaut, au type de voie ; à défaut, au début.
  let debut = mots.findIndex((m) => /^\d{1,4}[A-Z]?$/.test(m));
  if (debut < 0) debut = mots.findIndex((m) => TYPES_DE_VOIE_REQUETE.has(m));
  return mots.slice(debut < 0 ? 0 : debut).join(" ") || null;
};

/** Les types de voie seuls — sans les articles, qui ne démarrent pas une adresse. */
const TYPES_DE_VOIE_REQUETE = new Set([
  "RUE", "AVENUE", "AV", "BOULEVARD", "BD", "CHEMIN", "CHE", "CHEM", "IMPASSE", "IMP",
  "ALLEE", "ALL", "ROUTE", "RTE", "PLACE", "PL", "QUAI", "COURS", "CRS", "TRAVERSE",
  "MONTEE", "MTE", "SQUARE", "SQ", "VOIE", "ESPLANADE", "ESP", "PASSAGE", "SENTE", "SENTIER",
]);

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
 * 4. **Et par ADRESSE, toujours, en plus du nom.** Ajouté le 03/09/2026 :
 *    l'annuaire indexe la voie, et pour un artisan c'est le meilleur point
 *    d'entrée qui existe. « Électricien Perpignan | CÉRÉLEC » ramenait trois
 *    homonymes par le nom et aucun n'était le bon ; « 823 rue Jean-Baptiste
 *    Biot » rend CERELEC en premier. Le nom d'un panneau n'est pas une raison
 *    sociale, l'adresse d'un atelier est une adresse.
 */
export const chercherCandidats = async (
  fiche: FicheAResoudre,
  opts: OptionsResolution = {},
): Promise<CandidatScore[]> => {
  const aRapprocher: FicheARapprocher = {
    nom: fiche.name ?? "",
    ville: fiche.ville,
    codePostal: fiche.code_postal,
    adresse: fiche.adresse ?? null,
    avis: fiche.avis ?? undefined,
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
  const trouves: CandidatEtablissement[] = [];

  if (fiche.name) {
    const variantes = variantesDeRecherche(fiche.name, fiche.ville);
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
  }

  // ── Chemin 4 : recherche par adresse.
  //
  // ELLE TOURNE MÊME QUAND LE NOM A RAMENÉ QUELQUE CHOSE, et c'est le point.
  // « CÉRÉLEC » avait trois candidats au-dessus du seuil de proposition : une
  // recherche d'adresse conditionnée au silence du nom ne serait jamais partie,
  // et le bon candidat serait resté invisible derrière trois homonymes.
  const parAdresse: CandidatEtablissement[] = [];
  const requete = requeteDAdresse(fiche.adresse);
  if (requete) {
    for (const cp of [fiche.code_postal, null]) {
      const res = await searchByName(requete, { ...opts, codePostal: cp, limit: 10 });
      parAdresse.push(...res);
      if (res.length > 0) break;
    }
  }

  // ── Le garde-fou de la domiciliation.
  //
  // Une adresse ne vaut que si elle DÉSIGNE. « 90 esplanade du Général de
  // Gaulle, La Défense » porte des centaines de sociétés : au même numéro de la
  // même voie, le voisin obtient exactement les mêmes points que le bon. On
  // compte donc les ENTREPRISES distinctes que l'annuaire déclare à cette
  // adresse, et au-delà du seuil on retire l'adresse du barème — la fiche
  // retombe sur le nom, le code postal et le métier, comme avant.
  if (fiche.adresse) {
    const sirenSurPlace = new Set(
      parAdresse
        .filter((c) => c.adresse && similariteVoie(fiche.adresse!, c.adresse) === 1)
        // ⚠️ SEULS LES LOCAUX ENCORE OUVERTS OCCUPENT L'ADRESSE. Compter les
        // fermés faisait passer pour une domiciliation le cas le plus banal du
        // parc artisan : au 37 chemin Dubac à Cugnaux, l'entreprise
        // individuelle d'Adrien Rodriguez (cessée en 2016), sa holding et sa
        // société actuelle font trois SIREN — un seul homme, un seul atelier.
        .filter((c) => c.etatAdministratif !== "F" && c.etatAdministratif !== "C")
        .map((c) => c.siret.slice(0, 9)),
    );
    if (sirenSurPlace.size >= SEUIL_ADRESSE_PARTAGEE) aRapprocher.adresse = null;
  }

  return classer(aRapprocher, [...trouves, ...parAdresse])
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

  // ── LES PROPOSITIONS D'UNE FICHE SONT CELLES DE LA DERNIÈRE RECHERCHE.
  //
  // Sans cette purge, elles S'EMPILENT : une recherche antérieure laisse ses
  // lignes avec le score du barème de l'époque, et la porte automatique les
  // rejuge à côté des fraîches. Mesuré le 03/09/2026 sur la fiche 21
  // « Climatisation Paris 2 » — la ligne du Planning familial, notée 45/45 sur
  // le nom avant que la ville en soit retirée, survivait à la correction et
  // gagnait encore. Une décision HUMAINE, elle, ne s'efface jamais : le filtre
  // ne touche que `propose`.
  //
  // On ne purge qu'après une recherche FRUCTUEUSE — un `return 0` plus haut
  // sort avant. Une recherche muette ne doit pas effacer ce qu'une précédente
  // avait trouvé.
  const gardes = lignes.map((l) => l.siret);
  await sb
    .from("entreprise_siret_candidats")
    .delete()
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "propose")
    .not("siret", "in", `(${gardes.join(",")})`);

  return lignes.length;
};

/**
 * LA porte. Un candidat validé devient le SIRET de la fiche.
 *
 * Écrit `entreprises.siret` — la seule écriture de tout ce socle qui touche
 * `entreprises`. `decide_par` dit QUI a tranché, pour pouvoir le retrouver des
 * mois plus tard devant une fiche qui s'avère fausse ; `null` y est une réponse
 * légitime et non un oubli : c'est la règle des quatre critères qui a décidé,
 * et `siret_source` le nomme.
 *
 * LE SIRET EST TOUJOURS VÉRIFIÉ AU REGISTRE avant d'être écrit, même quand il
 * arrive d'ailleurs que de la liste de candidats — d'une recherche web, du pied
 * de page d'un site, d'une saisie. La clé de Luhn ne prouve rien : elle valide
 * la forme, pas l'existence, et un numéro plausible mais faux contaminerait
 * ensuite toutes les données publiques de la fiche.
 *
 * Vérifié sur un cas réel : la fiche 57 « KM Dépannage » a deux SIREN plausibles
 * à la MÊME adresse et au MÊME patronyme. L'un est l'entreprise de chauffage
 * cherchée (cessée, en liquidation), l'autre un taxi (NAF 49.32Z). Seul l'appel
 * au registre les distingue.
 */
export const validerCandidat = async (
  sb: SupabaseClient,
  params: {
    entreprise_id: number;
    siret: string;
    /**
     * QUI a tranché. `null` quand personne ne l'a fait à la main : la décision
     * vient alors de la règle des quatre critères du registre (un seul SIREN
     * candidat, nom + code postal + adresse + métier concordants), et c'est
     * `source: 'resolution_auto'` qui le dit. Mettre un uuid d'utilisateur
     * serait plus commode et ferait croire, dans six mois, que quelqu'un a
     * regardé cette fiche.
     */
    decide_par: string | null;
    commentaire?: string;
    /** D'où vient le numéro : 'resolution' (liste), 'recherche_web', 'saisie'. */
    source?: string;
    /** Injectable pour les tests ; sert la vérification au registre. */
    fetchImpl?: typeof fetch;
    /** Échappatoire explicite quand le registre est injoignable. */
    sansVerification?: boolean;
  },
): Promise<{ ok: true; avertissements: string[] } | { ok: false; erreur: string }> => {
  const siret = normalizeSiret(params.siret);
  if (!siret) return { ok: false, erreur: "siret_invalide" };

  const avertissements: string[] = [];

  if (!params.sansVerification) {
    let identite: Awaited<ReturnType<typeof fetchIdentite>>;
    try {
      identite = await fetchIdentite(siret, { fetchImpl: params.fetchImpl });
    } catch (e) {
      return { ok: false, erreur: `registre_injoignable: ${e instanceof Error ? e.message : e}` };
    }
    // Le registre ne connaît pas ce numéro : on n'écrit pas. C'est le garde-fou
    // qui distingue « trouvé sur le web » de « vérifié ».
    if (!identite) return { ok: false, erreur: "siret_inconnu_au_registre" };

    // Les divergences ne bloquent PAS — elles peuvent être légitimes (siège
    // ailleurs, activité mal codée) — mais elles remontent à l'appelant, qui
    // décide en les voyant.
    const { data: fiche } = await sb
      .from("entreprises")
      .select("code_postal")
      .eq("id", params.entreprise_id)
      .maybeSingle();
    const cpFiche = (fiche as { code_postal?: string } | null)?.code_postal;
    if (cpFiche && identite.codePostalSiege && cpFiche !== identite.codePostalSiege) {
      avertissements.push(
        `Code postal différent : fiche ${cpFiche}, registre ${identite.codePostalSiege}`,
      );
    }
    if (identite.etatAdministratif === "C") {
      avertissements.push(
        identite.dateFermeture
          ? `Entreprise cessée le ${identite.dateFermeture}`
          : "Entreprise cessée au registre",
      );
    }
  }

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
      siret_source: params.source ?? "resolution",
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

  return { ok: true, avertissements };
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
