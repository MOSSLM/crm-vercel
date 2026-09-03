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

/**
 * Types de voie, mentions de bâtiment et articles : présents d'un côté, absents
 * de l'autre, et jamais discriminants. « 30 RUE DE CRACOVIE » et « ZAE CAP NORD
 * 30 RUE DE CRACOVIE » sont la même adresse ; comparés mot à mot, ils ne le
 * sont pas.
 */
const TYPES_DE_VOIE = new Set([
  "RUE", "AVENUE", "AV", "BOULEVARD", "BD", "CHEMIN", "CHE", "CHEM", "IMPASSE", "IMP",
  "ALLEE", "ALL", "ROUTE", "RTE", "PLACE", "PL", "QUAI", "COURS", "CRS", "TRAVERSE",
  "MONTEE", "MTE", "SQUARE", "SQ", "VOIE", "LIEU", "DIT", "LD", "ZA", "ZAE", "ZI", "ZAC",
  "RESIDENCE", "RES", "BATIMENT", "BAT", "APPARTEMENT", "APT", "APPT", "ETAGE", "ETG",
  "BIS", "TER", "QUATER", "LOT", "LOTISSEMENT", "ESPLANADE", "ESP", "PASSAGE", "SENTE",
  "SENTIER", "CHEZ", "NUM", "N", "NO",
  "DE", "DU", "DES", "LA", "LE", "LES", "D", "L", "AU", "AUX", "ET", "SUR", "SOUS", "EN",
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

/**
 * L'ARTISAN DERRIÈRE LES INITIALES.
 *
 * ── LE PROBLÈME, POSÉ PAR MATTEO LE 03/09/2026 ────────────────────────────
 * « JP ça peut vouloir dire Jean-Pierre, Jacques Perret, enfin plein de trucs.
 * Si on croise avec les avis Google on peut trouver le vrai prénom ? »
 *
 * Le cas est le plus courant du parc artisan : l'enseigne du camion est faite
 * des INITIALES du patron, et le registre ne connaît que son état civil.
 * « AR CLIM » est immatriculée ADRIEN RODRIGUEZ, « MC Froid » MARIE CHEVALIER.
 * Comparés mot à mot ou lettre à lettre, ces deux noms sont étrangers — le
 * score rendait 0 sur des rapprochements pourtant certains.
 *
 * ── CE QU'ON COMPARE, ET DANS QUEL ORDRE ──────────────────────────────────
 * Les initiales se lisent DANS LES DEUX SENS : le registre écrit tantôt
 * « ADRIEN RODRIGUEZ », tantôt « REILHAC ARNAUD », sans règle lisible.
 *
 * ⚠️ ET UNE CONCORDANCE D'INITIALES NE VAUT PAS UNE CONCORDANCE DE NOM. Deux
 * lettres se partagent : dans une ville moyenne, « AR » désigne plusieurs
 * artisans. On rend donc 0,8 — exactement le seuil du critère, jamais au-delà —
 * et il faut toujours trois critères pour écrire. Les avis, eux, font passer à
 * 1 : quand un client écrit « Adrien est intervenu » sous la fiche et que le
 * registre déclare ADRIEN RODRIGUEZ à cette adresse, ce n'est plus une
 * initiale, c'est un prénom.
 */
const NON_INITIALES = new Set(["SAS", "SARL", "EURL", "SASU", "EIRL", "SCI", "SNC", "PRO", "AIR", "ECO", "GAZ", "SUD", "NORD", "EST", "OUEST"]);

/** « AR CLIM » → [« AR »]. Les jetons courts d'un nom de fiche, hors sa ville. */
export const siglesDeLaFiche = (nom: string, ville?: string | null): string[] =>
  motsHorsVille(nom, ville).filter(
    (m) => m.length >= 2 && m.length <= 3 && /^[A-Z]+$/.test(m) && !NON_INITIALES.has(m),
  );

/** « ADRIEN RODRIGUEZ » → [« AR », « RA »]. Les deux sens, faute de règle. */
export const initialesDe = (nomPersonne: string): string[] => {
  const mots = normaliserNom(nomPersonne)
    .split(" ")
    .filter((m) => m.length > 1 && !FORMES_JURIDIQUES.has(m));
  if (mots.length < 2) return [];
  const lettres = mots.map((m) => m[0]);
  return [lettres.join(""), [...lettres].reverse().join("")];
};

/**
 * LE NOM D'UNE FICHE, PRIVÉ DE SA VILLE — et sans ça il ment.
 *
 * Mesuré le 03/09/2026 sur la fiche 21 « Climatisation Paris 2 » : « Paris » est
 * son seul mot significatif, « climatisation » étant retiré comme bruit SEO. Le
 * nom concordait donc PARFAITEMENT (45/45) avec « ASS DEP PARIS MOUVEMENT FR
 * PLANNING FAMILIAL », et trois critères sur quatre suffisaient à écrire le
 * SIRET du Planning familial sur une fiche de climatisation.
 *
 * `variantesDeRecherche` retirait déjà la ville pour CHERCHER ; ne pas la
 * retirer pour NOTER était le trou. Rend 0 quand il ne reste rien à comparer :
 * un nom qui ne dit que sa ville ne distingue aucune entreprise de sa voisine.
 */
export const motsHorsVille = (nom: string, ville?: string | null): string[] =>
  motsSignificatifs(nom).filter((m) => !ville || similariteTexte(m, ville) < 0.85);

const similariteNomHorsVille = (nomFiche: string, valeur: string, ville?: string | null): number => {
  // ⚠️ UN NOM QUI NE DIT QUE SA VILLE N'IDENTIFIE RIEN — et c'est le seul cas
  // où l'on renonce complètement. Ailleurs, on garde la mesure d'origine : la
  // retirer coûtait plus cher qu'elle ne rapportait, « JP Climatisation » et
  // « J P CLIMATISATION » ne partageant AUCUN mot significatif (« J » et « P »
  // font un caractère) alors que les chaînes sont à une espace près identiques.
  const mf = motsHorsVille(nomFiche, ville);
  if (mf.length === 0) return 0;

  const brut = similariteNom(nomFiche, valeur);
  const mv = motsHorsVille(valeur, ville);
  if (mv.length === 0) return brut;

  const [court, long] = mf.length <= mv.length ? [mf, mv] : [mv, mf];
  let trouves = 0;
  for (const mot of court) {
    if (long.some((l) => similariteTexte(l, mot) >= 0.85)) trouves += 1;
  }
  return Math.max(brut, trouves / court.length);
};

// ---------------------------------------------------------------------------
// La voie
// ---------------------------------------------------------------------------

/**
 * LE SIGNAL LE PLUS FORT DU LOT, ET IL MANQUAIT.
 *
 * Le barème d'origine compare la COMMUNE et s'arrête là — quinze points pour
 * « Perpignan », rien pour « 823 rue Jean-Baptiste Biot ». Conséquence mesurée
 * le 03/09/2026 : la fiche « Électricien Perpignan | CÉRÉLEC » avait trois
 * candidats au-dessus du seuil, aucun n'était CÉRÉLEC — dont le siège est
 * pourtant AU MÊME NUMÉRO DE LA MÊME RUE. Le rapprochement était sous les yeux
 * du score, qui n'avait pas d'yeux pour le voir.
 *
 * Pour un artisan, la voie identifie mieux que le nom : l'enseigne du panneau
 * (« AR CLIM ») n'est presque jamais la raison sociale (« ADRIEN RODRIGUEZ »),
 * alors que l'atelier est bien à l'adresse où Google l'a photographié.
 *
 * ⚠️ TROIS PALIERS, ET LE NUMÉRO FAIT LA DIFFÉRENCE. Même voie ET même numéro
 * est une concordance ; même voie à un autre numéro ne l'est pas — dans une
 * zone artisanale, c'est le voisin. On rend donc 1, 0,7 ou 0,5, et c'est
 * `SEUILS` qui décide de ce qui vaut critère.
 */
/** L'adresse débarrassée de son code postal et de sa commune. */
const sansCodePostal = (adresse: string): string =>
  normaliserNom(adresse).replace(/\b\d{5}\b.*$/, " ").trim();

/**
 * LE NUMÉRO DE LA VOIE, c'est-à-dire celui qui PRÉCÈDE le type de voie.
 *
 * Prendre le premier chiffre venu se trompe sur les adresses composées, et le
 * cas n'est pas rare : « BOÎTE NUMÉRO 6 10 RUE DES LILAS D'ESPAGNE » lu de
 * gauche à droite rend 6, quand la fiche dit « 6 rue des Lilas d'Espagne » —
 * deux adresses différentes que le raccourci déclarait identiques.
 */
const numeroDeVoie = (adresse: string): string | null => {
  // Le code postal et tout ce qui suit sont retirés d'abord : l'`adresse` que
  // rend l'annuaire les recopie, et « 69390 » se lirait comme un numéro de rue.
  const mots = sansCodePostal(adresse).split(" ").filter(Boolean);
  const estNumero = (m: string) => /^\d{1,4}[A-Z]?$/.test(m);
  const typeVoie = mots.findIndex((m) => TYPES_DE_VOIE.has(m) && m.length > 1);
  if (typeVoie > 0 && estNumero(mots[typeVoie - 1])) return mots[typeVoie - 1].replace(/[A-Z]$/, "");
  if (typeVoie > 0) return null;
  const premier = mots.find(estNumero);
  return premier ? premier.replace(/[A-Z]$/, "") : null;
};

/** Les mots qui NOMMENT la voie : sans le numéro, le type ni les articles. */
export const motsDeVoie = (adresse: string): string[] =>
  sansCodePostal(adresse)
    .split(" ")
    .filter((m) => m.length > 1 && !TYPES_DE_VOIE.has(m) && !/^\d+[A-Z]?$/.test(m));

/** 0 → 1. Zéro veut dire « ce n'est pas la même voie », pas « on ne sait pas ». */
export const similariteVoie = (a: string, b: string): number => {
  const ma = motsDeVoie(a);
  const mb = motsDeVoie(b);
  if (ma.length === 0 || mb.length === 0) return 0;

  const [court, long] = ma.length <= mb.length ? [ma, mb] : [mb, ma];
  let trouves = 0;
  for (const mot of court) {
    if (long.some((l) => similariteTexte(l, mot) >= 0.85)) trouves += 1;
  }
  // En dessous de 80 % des mots du plus court, ce sont deux voies différentes :
  // créditer « à moitié » ferait passer un voisinage pour une adresse.
  if (trouves / court.length < 0.8) return 0;

  const na = numeroDeVoie(a);
  const nb = numeroDeVoie(b);
  if (na && nb) return na === nb ? 1 : 0.5;
  return 0.7;
};

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
  /**
   * La voie de la fiche, telle que Google la donne.
   *
   * ⚠️ L'APPELANT LA TAIT QUAND ELLE EST PARTAGÉE. Une domiciliation ou un
   * centre d'affaires porte vingt sociétés au même numéro : l'adresse cesse
   * alors d'identifier, et créditer ses points ferait valider le voisin.
   * `chercherCandidats` compte les SIREN trouvés à cette adresse et ne la
   * transmet pas au-delà de `SEUIL_ADRESSE_PARTAGEE`.
   */
  adresse?: string | null;
  /**
   * LE TEXTE des avis Google, jamais le nom de leur auteur.
   *
   * L'auteur d'un avis est le CLIENT ; celui qu'on cherche est nommé DANS le
   * texte (« Adrien est intervenu le jour même »). Confondre les deux ferait
   * rapprocher chaque fiche du patronyme de son client le plus bavard.
   */
  avis?: string[];
  /** Codes NAF attendus pour le métier. Un plombier-chauffagiste est en 43.22. */
  nafAttendus?: string[];
};

export type DetailScore = {
  nom: number;
  codePostal: number;
  ville: number;
  /**
   * La voie, 0 → 20. ABSENTE DES LIGNES ÉCRITES AVANT LE 03/09/2026, et c'est
   * voulu : `concordance` la lit en `?? 0`, donc aucun candidat déjà noté ne
   * change de verdict parce que le barème s'est enrichi.
   */
  rue: number;
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

/**
 * Poids. Le nom pèse le plus, mais ne suffit jamais seul.
 *
 * Les cinq premiers font 100 — c'est le barème d'origine, et il ne bouge pas :
 * `v_candidats_juges` et `SEUILS` lisent des valeurs absolues, et les déplacer
 * relirait en silence les 1 253 lignes déjà notées. La voie s'AJOUTE, et le
 * total reste borné à 100 par le `Math.min` en fin de fonction.
 */
const POIDS = { nom: 45, codePostal: 25, ville: 15, activite: 10, etat: 5, rue: 20 } as const;

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
/**
 * Les états civils qu'un candidat expose : le patron quand l'entreprise EST une
 * personne, et les dirigeants d'une société.
 *
 * ⚠️ `denomination` NULLE EST LE SIGNAL, pas une donnée manquante : l'annuaire
 * n'écrit pas de raison sociale pour une entreprise individuelle, il écrit
 * l'état civil dans `nomComplet`. C'est ce qui distingue « FREDERIC HAVEZ,
 * personne » de « FREDERIC HAVEZ SAS, société ».
 */
const personnesDuCandidat = (candidat: CandidatEtablissement): string[] => {
  const sorties: string[] = [];
  if (!candidat.identite.denomination && candidat.identite.nomComplet) {
    sorties.push(candidat.identite.nomComplet);
  }
  for (const d of candidat.identite.dirigeants ?? []) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    // Un dirigeant PERSONNE MORALE porte une `denomination` : ce n'est pas un
    // état civil, et ses « initiales » n'ont pas de sens.
    if (typeof o.denomination === "string") continue;
    const civil = [o.prenoms, o.nom].filter((v) => typeof v === "string" && v.trim() !== "").join(" ");
    if (civil) sorties.push(civil);
  }
  return sorties;
};

/**
 * Cette personne est-elle NOMMÉE dans les avis de la fiche ?
 *
 * Un prénom seul suffit — c'est ainsi qu'un client écrit — mais il doit être un
 * MOT ENTIER : « Marc » ne se trouve pas dans « marché ». Les mots trop courts
 * et les particules sont écartés, sans quoi « DE » ferait mouche partout.
 */
const nommeDansLesAvis = (personne: string, avis: readonly string[] | undefined): boolean => {
  if (!avis || avis.length === 0) return false;
  const mots = normaliserNom(personne)
    .split(" ")
    .filter((m) => m.length >= 4 && !FORMES_JURIDIQUES.has(m));
  if (mots.length === 0) return false;
  const texte = ` ${normaliserNom(avis.join(" "))} `;
  return mots.some((m) => texte.includes(` ${m} `));
};

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
  if (motsHorsVille(fiche.nom, fiche.ville).length === 0) {
    alertes.push("Le nom de la fiche ne porte aucun mot distinctif hors sa ville");
  }
  for (const [quoi, valeur] of aComparer) {
    const s = similariteNomHorsVille(fiche.nom, valeur, fiche.ville);
    if (s > meilleurNom) {
      meilleurNom = s;
      nomCompareA = `${quoi} : ${valeur}`;
    }
  }

  // ── Les personnes physiques : le patron, et les dirigeants d'une société.
  // Une raison sociale qui EST un état civil (`denomination` nulle, `nomComplet`
  // rempli) ne se compare pas à une enseigne — il faut passer par les initiales
  // et par ce que disent les avis.
  for (const personne of personnesDuCandidat(candidat)) {
    const sigles = siglesDeLaFiche(fiche.nom, fiche.ville);
    const initiales = initialesDe(personne);
    const parInitiales = sigles.some((s) => initiales.includes(s));
    const nomme = nommeDansLesAvis(personne, fiche.avis);

    if (!parInitiales && !nomme) continue;
    const s = parInitiales && nomme ? 1 : 0.8;
    if (s > meilleurNom) {
      meilleurNom = s;
      nomCompareA = parInitiales
        ? `initiales : ${sigles.find((x) => initiales.includes(x))} = ${personne}${nomme ? ", nommé dans les avis" : ""}`
        : `nommé dans les avis : ${personne}`;
    }
    alertes.push(
      parInitiales && nomme
        ? `Rapprochement par les initiales, confirmé par les avis (${personne})`
        : parInitiales
          ? `Rapprochement par les INITIALES seules (${personne}) — deux lettres se partagent`
          : `Nommé dans les avis Google (${personne})`,
    );
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

  // ── La voie. Elle ne se compare que si les deux côtés en ont une : une fiche
  // sans adresse ne doit pas faire chuter un candidat par ailleurs excellent.
  const rue = fiche.adresse && candidat.adresse ? similariteVoie(fiche.adresse, candidat.adresse) : 0;
  if (rue > 0 && rue < 1) {
    alertes.push(`Même voie, autre numéro (fiche ${fiche.adresse}, registre ${candidat.adresse})`);
  }

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
    rue: Math.round(rue * POIDS.rue),
    activite: activite * POIDS.activite,
    etat: cessee ? 0 : POIDS.etat,
    nomCompareA,
    alertes,
  };

  const score = Math.min(
    100,
    detail.nom + detail.codePostal + detail.ville + detail.rue + detail.activite + detail.etat,
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
