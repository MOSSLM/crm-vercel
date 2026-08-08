/**
 * Résolution d'identité : fabriquer des requêtes qui trouvent, puis noter les
 * candidats trouvés.
 *
 * C'EST LE POINT DUR, et il l'est pour une raison précise : les fiches viennent
 * de Google Maps et portent des titres COMMERCIAUX, pas des raisons sociales.
 * Mesuré sur l'API :
 *
 *   « CLIMIZ »              → 0 résultat   (immatriculée TOP CLIMATISATION)
 *   « Eco Solutions 44 »    → 0 résultat
 *
 * Autrement dit, la recherche naïve par le nom de la fiche échoue silencieusement
 * dans les deux cas. Deux réponses, et il faut les deux :
 *
 *   1. `variantesDeRecherche` — élargir la requête (retirer le suffixe SEO, la
 *      ville, la forme juridique) pour au moins RAMENER des candidats ;
 *   2. `scoreCandidat` — noter ce qui revient, en décomposant, pour qu'un humain
 *      puisse trancher sur pièces.
 *
 * Ce module ne décide JAMAIS. Un mauvais rapprochement écrit un SIRET faux, et
 * ce SIRET contamine ensuite toutes les données publiques de la fiche, les
 * qualifications RGE affichées sur un site public comprises.
 */

import type { CandidatEtablissement } from "./recherche-entreprises";

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Formes juridiques : bruit pur pour la comparaison de noms. */
const FORMES_JURIDIQUES = new Set([
  "SARL", "SAS", "SASU", "EURL", "SA", "SCI", "SNC", "EI", "EIRL", "SELARL",
  "SCOP", "SCM", "GIE", "ETS", "ETABLISSEMENTS", "STE", "SOCIETE", "ENTREPRISE",
]);

/**
 * Mots de service et de géographie qu'un titre Google Maps ajoute pour le
 * référencement. « Eco Solutions 44 - Climatisation & Pompe à chaleur Nantes »
 * n'est pas une raison sociale : c'est une raison sociale plus une annonce.
 */
const MOTS_SEO = new Set([
  "CLIMATISATION", "CLIM", "POMPE", "CHALEUR", "PAC", "CHAUFFAGE", "CHAUFFAGISTE",
  "PLOMBERIE", "PLOMBIER", "VENTILATION", "VMC", "ELECTRICITE", "ELECTRICIEN",
  "PHOTOVOLTAIQUE", "SOLAIRE", "RENOVATION", "DEPANNAGE", "INSTALLATION",
  "ENTRETIEN", "MAINTENANCE", "RGE", "ENERGIE", "ENERGIES", "THERMIQUE",
  "SANITAIRE", "BORNE", "BORNES", "IRVE", "CHAUDIERE", "ET", "DE", "DU", "LA",
  "LE", "LES", "A", "AU", "AUX", "DES", "EN", "SUR", "POUR",
]);

/** Majuscules, sans accents, sans ponctuation, espaces normalisés. */
export const normaliserNom = (s: string): string =>
  s
    .normalize("NFD")
    // Diacritiques combinants, en échappement explicite : écrits littéralement,
    // ils sont invisibles dans le fichier et un éditeur peut les manger.
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/['’`]/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

/** Les mots utiles d'un nom : sans forme juridique ni bruit SEO. */
export const motsSignificatifs = (s: string): string[] =>
  normaliserNom(s)
    .split(" ")
    .filter((m) => m.length > 1 && !FORMES_JURIDIQUES.has(m) && !MOTS_SEO.has(m));

// ---------------------------------------------------------------------------
// Similarité
// ---------------------------------------------------------------------------

/** Distance de Levenshtein, itérative pour ne pas exploser la pile. */
const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cout);
    }
    prev = cur;
  }
  return prev[b.length];
};

/** Ressemblance 0-1 entre deux chaînes, tolérante aux fautes de frappe. */
export const similariteTexte = (a: string, b: string): number => {
  const na = normaliserNom(a);
  const nb = normaliserNom(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const d = levenshtein(na, nb);
  return Math.max(0, 1 - d / Math.max(na.length, nb.length));
};

/**
 * Ressemblance par MOTS, qui rattrape ce que Levenshtein rate.
 *
 * « ECO SOLUTIONS 44 CLIMATISATION POMPE A CHALEUR NANTES » et « ECO SOLUTIONS »
 * sont très éloignés caractère par caractère, alors que l'un contient l'autre.
 * On mesure donc la part des mots du plus court retrouvés dans le plus long.
 */
export const similariteMots = (a: string, b: string): number => {
  const ma = motsSignificatifs(a);
  const mb = motsSignificatifs(b);
  if (ma.length === 0 || mb.length === 0) return 0;

  const [court, long] = ma.length <= mb.length ? [ma, mb] : [mb, ma];
  const ensemble = new Set(long);
  let trouves = 0;
  for (const mot of court) {
    // Égalité stricte, ou quasi-égalité pour absorber pluriels et coquilles.
    if (ensemble.has(mot) || long.some((l) => similariteTexte(l, mot) >= 0.85)) trouves += 1;
  }
  return trouves / court.length;
};

/** La meilleure des deux mesures : elles rattrapent des cas différents. */
export const similariteNom = (a: string, b: string): number =>
  Math.max(similariteTexte(a, b), similariteMots(a, b));

// ---------------------------------------------------------------------------
// Variantes de recherche
// ---------------------------------------------------------------------------

/**
 * Les requêtes à essayer, de la plus précise à la plus large.
 *
 * L'ordre compte : on s'arrête à la première qui ramène des candidats, sinon on
 * noierait un bon résultat précis sous cinquante homonymes d'une requête large.
 */
export const variantesDeRecherche = (nom: string, ville?: string | null): string[] => {
  const variantes: string[] = [];
  const ajouter = (v: string) => {
    const t = v.trim();
    if (t.length >= 2 && !variantes.some((x) => normaliserNom(x) === normaliserNom(t))) {
      variantes.push(t);
    }
  };

  ajouter(nom);

  // Le titre Google Maps est presque toujours « RAISON SOCIALE - argumentaire ».
  // Couper au premier séparateur isole la partie qui a une chance d'être
  // immatriculée.
  const avantSeparateur = nom.split(/\s[-–—|•:,]\s|\s{2,}/)[0];
  if (avantSeparateur) ajouter(avantSeparateur);

  // Sans les mots SEO ni la ville : le noyau du nom.
  const noyau = motsSignificatifs(nom)
    .filter((m) => !ville || similariteTexte(m, ville) < 0.85)
    .join(" ");
  if (noyau) ajouter(noyau);

  // Les deux premiers mots significatifs : « ECO SOLUTIONS » pour
  // « Eco Solutions 44 - Climatisation … ».
  const deuxPremiers = motsSignificatifs(nom).slice(0, 2).join(" ");
  if (deuxPremiers) ajouter(deuxPremiers);

  return variantes;
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type FicheARapprocher = {
  nom: string;
  ville?: string | null;
  codePostal?: string | null;
  /** Codes NAF attendus pour le métier. Un plombier-chauffagiste est en 43.22. */
  nafAttendus?: string[];
};

export type DetailScore = {
  nom: number;
  codePostal: number;
  ville: number;
  activite: number;
  etat: number;
  /** Ce qui a produit le meilleur score de nom : raison sociale ou enseigne. */
  nomCompareA: string | null;
  /** Alertes à montrer explicitement à l'humain, plutôt qu'à enfouir dans le score. */
  alertes: string[];
};

export type CandidatScore = {
  candidat: CandidatEtablissement;
  score: number;
  detail: DetailScore;
};

/** Poids, sur 100. Le nom pèse le plus, mais ne suffit jamais seul. */
const POIDS = { nom: 45, codePostal: 25, ville: 15, activite: 10, etat: 5 } as const;

/** NAF du chauffage / clim / plomberie, le cœur du parc. */
export const NAF_CVC_PAR_DEFAUT = ["43.22", "43.21", "43.29", "35.30", "43.99", "71.12"];

/**
 * Note un candidat de 0 à 100, en détaillant chaque composante.
 *
 * Le détail n'est pas décoratif : un score nu ne se conteste pas, un score
 * décomposé se relit. C'est ce qui permet à un humain de voir « nom 92, mais
 * code postal 0 » et de comprendre qu'il regarde un homonyme d'un autre
 * département.
 */
export const scoreCandidat = (fiche: FicheARapprocher, candidat: CandidatEtablissement): CandidatScore => {
  const alertes: string[] = [];

  // ── Nom : on compare au meilleur de la raison sociale, du nom complet et des
  // enseignes. C'est précisément ce qui rattrape « HYGIS » ↔ « HYGIENE MORE »
  // quand l'enseigne est déclarée.
  const aComparer: Array<[string, string]> = [];
  if (candidat.identite.denomination) aComparer.push(["raison sociale", candidat.identite.denomination]);
  if (candidat.identite.nomComplet) aComparer.push(["nom complet", candidat.identite.nomComplet]);
  if (candidat.identite.sigle) aComparer.push(["sigle", candidat.identite.sigle]);
  for (const e of candidat.enseignes) aComparer.push(["enseigne", e]);
  for (const e of candidat.identite.enseignes) aComparer.push(["enseigne", e]);

  let meilleurNom = 0;
  let nomCompareA: string | null = null;
  for (const [quoi, valeur] of aComparer) {
    const s = similariteNom(fiche.nom, valeur);
    if (s > meilleurNom) {
      meilleurNom = s;
      nomCompareA = `${quoi} : ${valeur}`;
    }
  }

  // ── Code postal : le discriminant le plus fiable dont on dispose. Deux
  // entreprises du même nom à 400 km sont deux entreprises.
  const cpFiche = fiche.codePostal?.trim();
  const cpCand = candidat.codePostal?.trim();
  let cp = 0;
  if (cpFiche && cpCand) {
    if (cpFiche === cpCand) cp = 1;
    // Même département : un déménagement de commune reste plausible.
    else if (cpFiche.slice(0, 2) === cpCand.slice(0, 2)) cp = 0.4;
    else alertes.push(`Département différent (fiche ${cpFiche}, registre ${cpCand})`);
  }

  const ville = fiche.ville && candidat.ville ? similariteNom(fiche.ville, candidat.ville) : 0;

  // ── Activité : un code NAF hors métier sur un nom qui ressemble est le signe
  // classique de l'homonyme.
  const naf = candidat.identite.nafCode ?? "";
  const attendus = fiche.nafAttendus ?? NAF_CVC_PAR_DEFAUT;
  const activite = naf && attendus.some((a) => naf.startsWith(a)) ? 1 : 0;
  if (naf && activite === 0) alertes.push(`Activité inattendue : NAF ${naf}`);

  // ── État : une entreprise cessée n'est pas éliminée. C'est peut-être LA
  // bonne, et la découvrir morte est un renseignement — 3 fiches du parc sont
  // dans ce cas. On la signale, on ne la cache pas.
  const cessee =
    candidat.etatAdministratif === "C" || candidat.identite.etatAdministratif === "C";
  if (cessee) {
    alertes.push(
      candidat.identite.dateFermeture
        ? `Entreprise CESSÉE le ${candidat.identite.dateFermeture}`
        : "Entreprise CESSÉE au registre",
    );
  }

  const detail: DetailScore = {
    nom: Math.round(meilleurNom * POIDS.nom),
    codePostal: Math.round(cp * POIDS.codePostal),
    ville: Math.round(ville * POIDS.ville),
    activite: activite * POIDS.activite,
    etat: cessee ? 0 : POIDS.etat,
    nomCompareA,
    alertes,
  };

  const score = Math.min(
    100,
    detail.nom + detail.codePostal + detail.ville + detail.activite + detail.etat,
  );

  return { candidat, score, detail };
};

/**
 * Trie et classe. Rend TOUS les candidats notés, pas seulement le meilleur :
 * deux candidats à deux points d'écart doivent se voir côte à côte, sans quoi
 * l'humain valide le premier sans savoir qu'il y avait un second.
 */
export const classer = (
  fiche: FicheARapprocher,
  candidats: CandidatEtablissement[],
): CandidatScore[] => {
  const parSiret = new Map<string, CandidatScore>();
  for (const c of candidats) {
    const note = scoreCandidat(fiche, c);
    const existant = parSiret.get(c.siret);
    if (!existant || note.score > existant.score) parSiret.set(c.siret, note);
  }
  return [...parSiret.values()].sort((a, b) => b.score - a.score);
};

/**
 * Seuil au-dessous duquel il n'y a rien à proposer.
 *
 * Ce n'est PAS un seuil d'auto-validation — il n'en existe aucun. Même à 100,
 * un humain tranche. C'est seulement le point où proposer un candidat ferait
 * perdre plus de temps qu'il n'en fait gagner.
 */
export const SEUIL_PROPOSITION = 45;
