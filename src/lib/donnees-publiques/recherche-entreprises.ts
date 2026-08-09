/**
 * Client `recherche-entreprises.api.gouv.fr` — identité, taille, finances,
 * dirigeants.
 *
 * Gratuite, sans clé, sans quota constaté. On reste néanmoins poli : un seul
 * appel par entreprise et par passage, et un plafond de lot côté appelant.
 *
 * Ce module ne fait QUE parler à l'API et normaliser sa réponse. Il n'écrit
 * rien : la persistance est dans `service.ts`, ce qui permet de tester tout le
 * décodage — et donc tous les pièges — sans base de données.
 */

import { normalizeSiren, normalizeSiret, sirenOf } from "./siret";

const BASE = "https://recherche-entreprises.api.gouv.fr";

/** Réponse brute, réduite aux champs qu'on lit réellement. */
type RawEtablissement = {
  siret?: string;
  adresse?: string;
  code_postal?: string;
  libelle_commune?: string;
  commune?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  date_creation?: string | null;
  date_fermeture?: string | null;
  etat_administratif?: string | null;
  tranche_effectif_salarie?: string | null;
  annee_tranche_effectif_salarie?: string | null;
  caractere_employeur?: string | null;
  liste_enseignes?: string[] | null;
  liste_idcc?: string[] | null;
  liste_rge?: string[] | null;
  est_siege?: boolean;
};

type RawUniteLegale = {
  siren?: string;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  sigle?: string | null;
  siege?: RawEtablissement | null;
  matching_etablissements?: RawEtablissement[] | null;
  activite_principale?: string | null;
  activite_principale_naf25?: string | null;
  section_activite_principale?: string | null;
  nature_juridique?: string | null;
  categorie_entreprise?: string | null;
  annee_categorie_entreprise?: string | null;
  date_creation?: string | null;
  date_fermeture?: string | null;
  date_mise_a_jour?: string | null;
  etat_administratif?: string | null;
  tranche_effectif_salarie?: string | null;
  annee_tranche_effectif_salarie?: string | null;
  nombre_etablissements?: number | null;
  nombre_etablissements_ouverts?: number | null;
  dirigeants?: unknown[] | null;
  finances?: Record<string, { ca?: number | null; resultat_net?: number | null }> | null;
  complements?: Record<string, unknown> | null;
  tva?: string[] | null;
};

/** Ce que le reste du code manipule : plat, typé, déjà débarrassé des pièges. */
export type IdentiteEntreprise = {
  siren: string;
  siret: string | null;
  denomination: string | null;
  nomComplet: string | null;
  sigle: string | null;
  enseignes: string[];
  dateCreation: string | null;
  dateCreationEtablissement: string | null;
  dateFermeture: string | null;
  etatAdministratif: "A" | "C" | null;
  nafCode: string | null;
  nafCode2025: string | null;
  nafSection: string | null;
  natureJuridique: string | null;
  categorieEntreprise: string | null;
  categorieEntrepriseAnnee: string | null;
  trancheEffectifCode: string | null;
  trancheEffectifAnnee: string | null;
  estEmployeur: boolean | null;
  nbEtablissements: number | null;
  nbEtablissementsOuverts: number | null;
  chiffreAffaires: number | null;
  resultatNet: number | null;
  exerciceAnnee: number | null;
  financesHistorique: Record<string, { ca: number | null; resultat_net: number | null }>;
  dirigeants: unknown[];
  tvaIntracommunautaire: string | null;
  idcc: string[];
  estRgeIndicatif: boolean | null;
  complements: Record<string, unknown>;
  adresseSiege: string | null;
  codePostalSiege: string | null;
  villeSiege: string | null;
  communeInsee: string | null;
  latSiege: number | null;
  lngSiege: number | null;
  sourceMajLe: string | null;
};

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Le mapping financier, qui porte le piège le plus coûteux du lot.
 *
 * `ca: 0` ne veut PAS dire « zéro euro de chiffre d'affaires », ça veut dire
 * « non publié ». Mesuré : sur 8 entreprises ayant déposé des comptes, 6 sont à
 * `ca: 0` avec un résultat net à cinq ou six chiffres. Écrire 0 afficherait
 * « CA : 0 € » sur des entreprises qui tournent à plusieurs centaines de
 * milliers d'euros.
 *
 * `resultat_net` suit la règle INVERSE et c'est délibéré : il est conservé tel
 * quel, y compris négatif (-59 769 € observé) et y compris un 0 réel. C'est le
 * chiffre le mieux couvert des deux — publié 8 fois sur 8 dans l'échantillon,
 * contre 2 fois sur 8 pour le CA — parce que les artisans déposent des comptes
 * confidentiels : le résultat sort, le CA non. L'annuler sur un exercice à
 * l'équilibre jetterait la seule donnée financière disponible.
 */
export const parseFinances = (
  finances: RawUniteLegale["finances"],
): Pick<IdentiteEntreprise, "chiffreAffaires" | "resultatNet" | "exerciceAnnee" | "financesHistorique"> => {
  const empty = {
    chiffreAffaires: null,
    resultatNet: null,
    exerciceAnnee: null,
    financesHistorique: {} as IdentiteEntreprise["financesHistorique"],
  };
  if (!finances || typeof finances !== "object") return empty;

  const historique: IdentiteEntreprise["financesHistorique"] = {};
  for (const [annee, valeurs] of Object.entries(finances)) {
    if (!/^\d{4}$/.test(annee) || !valeurs || typeof valeurs !== "object") continue;
    const caBrut = num(valeurs.ca);
    historique[annee] = {
      // 0 => non publié. C'est ici, et une seule fois, que la conversion a lieu.
      ca: caBrut === 0 ? null : caBrut,
      resultat_net: num(valeurs.resultat_net),
    };
  }

  const annees = Object.keys(historique).sort();
  const derniere = annees[annees.length - 1];
  if (!derniere) return empty;

  return {
    chiffreAffaires: historique[derniere].ca,
    resultatNet: historique[derniere].resultat_net,
    exerciceAnnee: Number(derniere),
    financesHistorique: historique,
  };
};

/** Normalise une unité légale de l'API vers notre forme plate. */
export const parseUniteLegale = (raw: RawUniteLegale): IdentiteEntreprise | null => {
  const siren = normalizeSiren(raw.siren ?? null) ?? str(raw.siren);
  if (!siren) return null;

  const siege = raw.siege ?? null;
  // Le siège n'est pas toujours présent dans la réponse ; à défaut on prend le
  // premier établissement rendu, sinon on reste sans SIRET plutôt que d'en
  // inventer un.
  const etab = siege ?? raw.matching_etablissements?.[0] ?? null;

  const etat = str(raw.etat_administratif);
  const finances = parseFinances(raw.finances);
  const complements = (raw.complements ?? {}) as Record<string, unknown>;

  return {
    siren,
    siret: normalizeSiret(etab?.siret ?? null),
    denomination: str(raw.nom_raison_sociale),
    nomComplet: str(raw.nom_complet),
    sigle: str(raw.sigle),
    // Les enseignes réconcilient le nom affiché avec la raison sociale :
    // c'est le champ qui rattache « HYGIS Evry » à « HYGIENE MORE ».
    enseignes: (etab?.liste_enseignes ?? []).filter((e): e is string => typeof e === "string" && e.trim() !== ""),

    // Date de l'UNITÉ LÉGALE. Distincte de celle de l'établissement : ECLEIS a
    // un siège créé en 2020 pour une entreprise née en 1989. C'est celle-ci qui
    // fait l'ancienneté commerciale.
    dateCreation: str(raw.date_creation),
    dateCreationEtablissement: str(etab?.date_creation ?? null),
    dateFermeture: str(raw.date_fermeture),
    etatAdministratif: etat === "A" || etat === "C" ? etat : null,

    nafCode: str(raw.activite_principale),
    nafCode2025: str(raw.activite_principale_naf25),
    nafSection: str(raw.section_activite_principale),
    natureJuridique: str(raw.nature_juridique),
    categorieEntreprise: str(raw.categorie_entreprise),
    categorieEntrepriseAnnee: str(raw.annee_categorie_entreprise),

    // CODE INSEE, jamais converti en nombre. Cf. `effectif.ts`.
    trancheEffectifCode: str(raw.tranche_effectif_salarie),
    trancheEffectifAnnee: str(raw.annee_tranche_effectif_salarie),
    estEmployeur: etab?.caractere_employeur === "O" ? true : etab?.caractere_employeur === "N" ? false : null,
    nbEtablissements: num(raw.nombre_etablissements),
    nbEtablissementsOuverts: num(raw.nombre_etablissements_ouverts),

    ...finances,

    dirigeants: Array.isArray(raw.dirigeants) ? raw.dirigeants : [],
    tvaIntracommunautaire: Array.isArray(raw.tva) ? str(raw.tva[0]) : null,
    idcc: (etab?.liste_idcc ?? []).filter((c): c is string => typeof c === "string"),
    // Indicatif SEULEMENT : la vérité sur les qualifications est l'ADEME.
    estRgeIndicatif: typeof complements.est_rge === "boolean" ? complements.est_rge : null,
    complements,

    adresseSiege: str(etab?.adresse ?? null),
    codePostalSiege: str(etab?.code_postal ?? null),
    villeSiege: str(etab?.libelle_commune ?? null),
    communeInsee: str(etab?.commune ?? null),
    latSiege: num(etab?.latitude),
    lngSiege: num(etab?.longitude),
    sourceMajLe: str(raw.date_mise_a_jour),
  };
};

export type RechercheOptions = {
  /** Injectable pour les tests ; `fetch` global en production. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

/**
 * L'API A un quota, contrairement à ce qu'on a cru longtemps.
 *
 * Mesuré : 40 requêtes lancées en parallèle, **26 rejetées en HTTP 429**. En
 * cadençant à ~4 requêtes par seconde, les 40 passent. Le quota est propre à
 * `recherche-entreprises` — l'ADEME encaisse 40 requêtes simultanées sans
 * broncher.
 *
 * Deux protections, parce qu'elles ne servent pas à la même chose :
 *   - l'espacement ÉVITE le 429 (on ne le provoque pas) ;
 *   - le backoff le SURVIT quand il arrive quand même, par exemple si une autre
 *     instance de la fonction tape en même temps.
 *
 * Sans ça, une passe de résolution sur les 150 fiches sans identifiant — jusqu'à
 * huit requêtes chacune — se ferait jeter en masse, et chaque échec ressemblerait
 * à « entreprise introuvable ».
 */
const ESPACEMENT_MS = 260;
const MAX_TENTATIVES = 4;

/** Dernier départ de requête, pour espacer les appels successifs d'un même lot. */
let dernierAppel = 0;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const attendreSonTour = async (): Promise<void> => {
  const attente = dernierAppel + ESPACEMENT_MS - Date.now();
  if (attente > 0) await dormir(attente);
  dernierAppel = Date.now();
};

/** Test-only : remet le cadenceur à zéro entre deux cas. */
export const __resetCadenceurPourTests = () => {
  dernierAppel = 0;
};

const call = async (url: string, opts: RechercheOptions): Promise<{ results: RawUniteLegale[] }> => {
  const doFetch = opts.fetchImpl ?? fetch;

  for (let tentative = 1; ; tentative += 1) {
    await attendreSonTour();
    const res = await doFetch(url, {
      signal: opts.signal,
      headers: { accept: "application/json" },
    });

    if (res.status === 429 && tentative < MAX_TENTATIVES) {
      // `Retry-After` fait foi quand le serveur le donne : deviner mieux que ce
      // qu'il annonce n'a pas de sens. Sinon on double à chaque tentative.
      const annonce = Number(res.headers?.get?.("retry-after"));
      const attente = Number.isFinite(annonce) && annonce > 0 ? annonce * 1000 : 2 ** tentative * 500;
      await dormir(attente);
      continue;
    }

    if (!res.ok) throw new Error(`recherche-entreprises HTTP ${res.status}`);

    const body = (await res.json()) as { results?: RawUniteLegale[] };
    return { results: Array.isArray(body.results) ? body.results : [] };
  }
};

/**
 * Identité par SIRET ou SIREN — le chemin déterministe, sans jugement.
 *
 * Quand on cherche par SIRET, l'API rend l'unité légale entière : on RÉ-ALIGNE
 * alors le résultat sur l'établissement demandé. Sans ça, une entreprise
 * multi-sites interrogée sur un établissement secondaire rendrait l'adresse et
 * l'effectif du siège — une donnée juste au niveau de l'entreprise, fausse au
 * niveau de la fiche.
 */
export const fetchIdentite = async (
  identifiant: string,
  opts: RechercheOptions = {},
): Promise<IdentiteEntreprise | null> => {
  const siret = normalizeSiret(identifiant);
  const siren = siret ? sirenOf(siret) : normalizeSiren(identifiant);
  if (!siren) return null;

  const { results } = await call(`${BASE}/search?q=${encodeURIComponent(siret ?? siren)}`, opts);
  const raw = results.find((r) => normalizeSiren(r.siren ?? null) === siren) ?? results[0];
  if (!raw) return null;

  const parsed = parseUniteLegale(raw);
  if (!parsed) return null;
  if (!siret) return parsed;

  // Ré-alignement sur l'établissement demandé.
  const etab =
    (raw.matching_etablissements ?? []).find((e) => normalizeSiret(e.siret ?? null) === siret) ??
    (normalizeSiret(raw.siege?.siret ?? null) === siret ? raw.siege ?? null : null);
  if (!etab) return { ...parsed, siret };

  return {
    ...parsed,
    siret,
    dateCreationEtablissement: str(etab.date_creation ?? null) ?? parsed.dateCreationEtablissement,
    enseignes: (etab.liste_enseignes ?? []).filter((e): e is string => typeof e === "string" && e.trim() !== ""),
    adresseSiege: str(etab.adresse ?? null) ?? parsed.adresseSiege,
    codePostalSiege: str(etab.code_postal ?? null) ?? parsed.codePostalSiege,
    villeSiege: str(etab.libelle_commune ?? null) ?? parsed.villeSiege,
    communeInsee: str(etab.commune ?? null) ?? parsed.communeInsee,
    latSiege: num(etab.latitude) ?? parsed.latSiege,
    lngSiege: num(etab.longitude) ?? parsed.lngSiege,
  };
};

/**
 * Un candidat au niveau ÉTABLISSEMENT.
 *
 * Pourquoi l'établissement et non l'entreprise : le SIRET qu'on doit stocker
 * est celui de l'établissement où la fiche exerce, pas celui du siège.
 *
 * Cas vérifié, et il n'a rien d'exotique — la fiche « CLIMIZ, Paris 75011 » est
 * l'entreprise TOP CLIMATISATION, dont le SIÈGE est à Paris 75017 et dont
 * l'établissement du 75011 porte le SIRET 88829510200014. Retenir le siège
 * donnerait la bonne entreprise à la mauvaise adresse, et surtout interrogerait
 * ensuite l'ADEME sur un établissement qui ne porte pas les qualifications.
 */
export type CandidatEtablissement = {
  identite: IdentiteEntreprise;
  siret: string;
  estSiege: boolean;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  enseignes: string[];
  etatAdministratif: string | null;
};

/**
 * Déplie une unité légale en un candidat par établissement pertinent.
 *
 * `matching_etablissements` porte les établissements qui ont RÉPONDU à la
 * requête (c'est là que le filtre `code_postal` s'applique) ; le siège n'y est
 * pas forcément. On part donc de cette liste, et on ne retombe sur le siège que
 * si elle est vide.
 */
export const etablissementsCandidats = (raw: RawUniteLegale): CandidatEtablissement[] => {
  const identite = parseUniteLegale(raw);
  if (!identite) return [];

  const matched = (raw.matching_etablissements ?? []).filter(Boolean);
  const source = matched.length > 0 ? matched : raw.siege ? [raw.siege] : [];

  return source
    // Annotation explicite : sans elle, le `siret` du spread est inféré comme
    // `string` (et non `string | null`), donc plus ÉTROIT que
    // `CandidatEtablissement` — ce qui invalide le prédicat du `filter` en
    // dessous.
    .map((e): CandidatEtablissement | null => {
      const siret = normalizeSiret(e.siret ?? null);
      if (!siret) return null;
      return {
        identite: { ...identite, siret },
        siret,
        estSiege: e.est_siege === true,
        adresse: str(e.adresse ?? null),
        codePostal: str(e.code_postal ?? null),
        ville: str(e.libelle_commune ?? null),
        enseignes: (e.liste_enseignes ?? []).filter(
          (x): x is string => typeof x === "string" && x.trim() !== "",
        ),
        etatAdministratif: str(e.etat_administratif ?? null),
      };
    })
    .filter((c): c is CandidatEtablissement => c !== null);
};

/**
 * Recherche par texte libre — le chemin qui demande un jugement.
 *
 * Rend les candidats BRUTS, sans en choisir aucun. Le scoring et la décision
 * sont ailleurs (`score.ts`, puis un humain) : cette fonction n'a pas le droit
 * de trancher, parce qu'une enseigne ne correspond pas à une raison sociale et
 * qu'un mauvais rapprochement se propage ensuite à toutes les données.
 */
export const searchByName = async (
  nom: string,
  opts: RechercheOptions & { codePostal?: string | null; limit?: number } = {},
): Promise<CandidatEtablissement[]> => {
  const q = nom.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, per_page: String(opts.limit ?? 10) });
  if (opts.codePostal) params.set("code_postal", opts.codePostal);

  const { results } = await call(`${BASE}/search?${params.toString()}`, opts);
  return results.flatMap(etablissementsCandidats);
};
