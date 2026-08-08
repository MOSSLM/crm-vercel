/**
 * Ce qu'il faut savoir avant de décrocher son téléphone.
 *
 * Module PUR : il ne lit ni la base ni le réseau, il transforme un dossier en
 * trois choses qu'un commercial regarde dans cet ordre — ce qui doit l'arrêter,
 * ce qui lui donne une raison d'appeler, et à qui parler.
 *
 * LE PRINCIPE DE CONCEPTION, dicté par les couvertures réelles : l'absence de
 * donnée est la NORME. Mesuré sur les 40 fiches hydratées :
 *
 *   dirigeants nommés   40/40   100 %
 *   effectif             19/40    47 %
 *   résultat net         16/40    40 %
 *   chiffre d'affaires    5/40    12 %
 *
 * Une interface qui réserve une case à chaque champ afficherait donc une grille
 * de tirets. Toutes les fonctions ici rendent des LISTES de ce qui existe, et
 * jamais une structure à trous : un bloc sans contenu ne doit pas être rendu du
 * tout.
 */

export type Dirigeant = {
  nom?: string | null;
  prenoms?: string | null;
  qualite?: string | null;
  annee_de_naissance?: string | null;
  type_dirigeant?: string | null;
};

export type QualificationFiche = {
  id: string;
  code_qualification: string;
  nom_certificat: string | null;
  domaine: string | null;
  meta_domaine: string | null;
  date_debut: string | null;
  date_fin: string | null;
  url_qualification: string | null;
};

export type DossierEntreprise = {
  entreprise_id: number;
  nom_crm: string | null;
  siret: string | null;
  denomination: string | null;
  enseignes: string[] | null;
  date_creation: string | null;
  date_fermeture: string | null;
  etat_administratif: string | null;
  naf_code: string | null;
  categorie_entreprise: string | null;
  tranche_effectif_code: string | null;
  tranche_effectif_annee: string | null;
  chiffre_affaires: number | null;
  resultat_net: number | null;
  exercice_annee: number | null;
  dirigeants: Dirigeant[] | null;
  qualifications: QualificationFiche[];
  identite_rafraichie_le: string | null;
  rge_rafraichi_le: string | null;
};

// ---------------------------------------------------------------------------
// Risques
// ---------------------------------------------------------------------------

export type Risque = {
  /** `bloquant` sort la fiche de la prospection ; `avertissement` la nuance. */
  niveau: "bloquant" | "avertissement";
  titre: string;
  detail: string | null;
};

/**
 * Les mots qui, dans la qualité d'un dirigeant, signalent une procédure
 * collective. Une entreprise qui n'a plus qu'un liquidateur au registre est
 * morte, même si `etat_administratif` vaut encore 'A' — la radiation suit
 * souvent la liquidation de plusieurs mois.
 */
const QUALITES_DE_FIN = ["liquidateur", "mandataire judiciaire", "administrateur judiciaire"];

/**
 * Ce qui doit arrêter un appel avant qu'il commence.
 *
 * Trois cas connus du parc au moment de l'écriture, et le premier est déjà dans
 * les données : la fiche 1494 « EMC Sarl » est immatriculée EDDIA NOUVELLE
 * AQUITAINE et CESSÉE depuis le 27/05/2026. Continuer à la démarcher, c'est du
 * temps commercial perdu et de la réputation d'envoi gâchée.
 */
export const evaluerRisques = (d: DossierEntreprise): Risque[] => {
  const risques: Risque[] = [];

  if (d.etat_administratif === "C") {
    risques.push({
      niveau: "bloquant",
      titre: "Entreprise cessée",
      detail: d.date_fermeture ? `Fermée le ${formatDate(d.date_fermeture)}` : "Radiée du registre",
    });
  }

  const enFin = (d.dirigeants ?? []).filter((dir) =>
    QUALITES_DE_FIN.some((q) => (dir.qualite ?? "").toLowerCase().includes(q)),
  );
  if (enFin.length > 0) {
    risques.push({
      niveau: "bloquant",
      titre: "Procédure collective",
      detail: `Au registre : ${enFin.map((x) => x.qualite).join(", ")}`,
    });
  }

  // Un résultat négatif n'interdit pas d'appeler — beaucoup d'entreprises
  // saines passent une mauvaise année — mais le savoir change le discours, et
  // interdit de facturer d'avance.
  if (d.resultat_net !== null && d.resultat_net < 0) {
    risques.push({
      niveau: "avertissement",
      titre: "Résultat net négatif",
      detail: `${formatEuros(d.resultat_net)} sur l'exercice ${d.exercice_annee ?? "connu"}`,
    });
  }

  return risques;
};

/** Raccourci d'affichage : la fiche doit-elle sortir de la prospection ? */
export const estAProscrire = (d: DossierEntreprise): boolean =>
  evaluerRisques(d).some((r) => r.niveau === "bloquant");

// ---------------------------------------------------------------------------
// Accroches d'appel
// ---------------------------------------------------------------------------

export type Accroche = {
  /** `chaude` = périssable, à jouer maintenant. */
  intensite: "chaude" | "tiede";
  titre: string;
  detail: string | null;
};

const JOURS = 86_400_000;

export const joursAvant = (dateIso: string, maintenant: Date = new Date()): number =>
  Math.round((new Date(`${dateIso}T00:00:00Z`).getTime() - maintenant.getTime()) / JOURS);

/**
 * Ce qui donne une raison d'appeler AUJOURD'HUI.
 *
 * La plus forte est l'échéance d'une qualification RGE : elle est datée,
 * vérifiable, et l'entreprise y pense déjà. « Je vois que votre Qualibois
 * arrive à échéance le 25 août » n'est pas une accroche commerciale, c'est une
 * information utile — et ça ouvre une conversation.
 *
 * Réel dans les données : Chaleur et Confort a trois qualifications qui
 * expirent le 25/08/2026, soit dans 17 jours.
 */
export const accrochesDAppel = (
  d: DossierEntreprise,
  maintenant: Date = new Date(),
): Accroche[] => {
  const accroches: Accroche[] = [];

  // ── Qualifications qui expirent, regroupées par date : trois qualifications
  // au même terme font UNE accroche, pas trois lignes qui se répètent.
  const parEcheance = new Map<string, QualificationFiche[]>();
  for (const q of d.qualifications) {
    if (!q.date_fin) continue;
    const j = joursAvant(q.date_fin, maintenant);
    if (j < 0 || j > 90) continue;
    const liste = parEcheance.get(q.date_fin) ?? [];
    liste.push(q);
    parEcheance.set(q.date_fin, liste);
  }

  for (const [date, liste] of [...parEcheance.entries()].sort()) {
    const j = joursAvant(date, maintenant);
    const noms = [...new Set(liste.map((q) => q.nom_certificat).filter(Boolean))];
    accroches.push({
      intensite: j <= 60 ? "chaude" : "tiede",
      titre:
        noms.length === 1
          ? `${noms[0]} expire dans ${j} jour${j > 1 ? "s" : ""}`
          : `${liste.length} qualifications expirent dans ${j} jour${j > 1 ? "s" : ""}`,
      detail: `Échéance le ${formatDate(date)}${noms.length > 1 ? ` — ${noms.join(", ")}` : ""}`,
    });
  }

  // ── Déjà expirées : l'entreprise a peut-être perdu un marché sans le dire,
  // et un logo est peut-être encore affiché sur son site.
  const expirees = d.qualifications.filter(
    (q) => q.date_fin && joursAvant(q.date_fin, maintenant) < 0,
  );
  if (expirees.length > 0) {
    accroches.push({
      intensite: "chaude",
      titre: `${expirees.length} qualification${expirees.length > 1 ? "s" : ""} expirée${expirees.length > 1 ? "s" : ""}`,
      detail: expirees
        .map((q) => `${q.nom_certificat ?? q.code_qualification} (${formatDate(q.date_fin!)})`)
        .join(", "),
    });
  }

  // ── Anniversaire rond : « 50 ans cette année » se dit au téléphone.
  const anciennete = ancienneteAnnees(d, maintenant);
  if (anciennete !== null && anciennete >= 10 && anciennete % 10 === 0) {
    accroches.push({
      intensite: "tiede",
      titre: `${anciennete} ans d'existence cette année`,
      detail: d.date_creation ? `Créée le ${formatDate(d.date_creation)}` : null,
    });
  }

  // ── Toute jeune : c'est le moment où l'on cherche de la visibilité.
  // Le libellé parle en durée écoulée, pas en année civile : une société
  // immatriculée en septembre 2025 n'a pas été « créée cette année » quand on
  // la regarde en août 2026, elle a onze mois.
  if (anciennete !== null && anciennete < 2) {
    accroches.push({
      intensite: "tiede",
      titre: anciennete < 1 ? "Créée il y a moins d'un an" : "Créée il y a moins de deux ans",
      detail: d.date_creation ? `Immatriculée le ${formatDate(d.date_creation)}` : null,
    });
  }

  return accroches;
};

// ---------------------------------------------------------------------------
// Dirigeants
// ---------------------------------------------------------------------------

/**
 * Qualités qui ne décident PAS. Un commissaire aux comptes est un auditeur
 * externe, pas un patron : l'appeler est un appel perdu, et il y en a 3 dans
 * les données. On ne les cache pas, on les range à part.
 */
const QUALITES_NON_DECIDEUSES = ["commissaire aux comptes"];

const RANG_QUALITE = ["gérant", "président", "directeur général", "associé"];

export type DirigeantAffiche = {
  nomComplet: string;
  qualite: string | null;
  age: number | null;
  estDecideur: boolean;
};

const nomPropre = (s: string): string =>
  s
    .toLocaleLowerCase("fr")
    .replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, sep, c) => sep + c.toLocaleUpperCase("fr"));

/**
 * Met en forme et classe les dirigeants : décideurs d'abord.
 *
 * Le nom brut du registre est en CAPITALES et porte parfois le nom d'usage
 * entre parenthèses — « CREPEAU (ACQUART) ». On garde le nom légal, on
 * recapitalise, et on n'invente rien.
 */
export const classerDirigeants = (
  dirigeants: Dirigeant[] | null,
  maintenant: Date = new Date(),
): DirigeantAffiche[] => {
  const annee = maintenant.getUTCFullYear();

  return (dirigeants ?? [])
    .filter((d) => d.type_dirigeant !== "personne morale")
    .map((d) => {
      const nomLegal = (d.nom ?? "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
      const prenoms = (d.prenoms ?? "").trim();
      const nomComplet = [prenoms, nomLegal].filter(Boolean).map(nomPropre).join(" ").trim();
      const naissance = Number(d.annee_de_naissance);
      const qualite = d.qualite?.trim() || null;

      return {
        nomComplet,
        qualite,
        age: Number.isFinite(naissance) && naissance > 1900 ? annee - naissance : null,
        estDecideur: !QUALITES_NON_DECIDEUSES.some((q) => (qualite ?? "").toLowerCase().includes(q)),
      };
    })
    .filter((d) => d.nomComplet !== "")
    .sort((a, b) => {
      if (a.estDecideur !== b.estDecideur) return a.estDecideur ? -1 : 1;
      const ra = RANG_QUALITE.findIndex((q) => (a.qualite ?? "").toLowerCase().includes(q));
      const rb = RANG_QUALITE.findIndex((q) => (b.qualite ?? "").toLowerCase().includes(q));
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    });
};

/**
 * Les dirigeants qui sont des SOCIÉTÉS, et non des personnes.
 *
 * `classerDirigeants` les écarte — on ne passe pas un appel à une holding. Mais
 * les taire ferait croire à une donnée manquante alors qu'on sait quelque
 * chose : la fiche 1494 (EDDIA) n'a QUE deux personnes morales à sa tête,
 * ORAVEST et HOLDING DU BEAUVOIR. Savoir qu'une société est détenue par des
 * holdings explique pourquoi aucun nom n'apparaît, et oriente vers le bon
 * interlocuteur.
 */
export const personnesMorales = (dirigeants: Dirigeant[] | null): string[] =>
  (dirigeants ?? [])
    .filter((d) => d.type_dirigeant === "personne morale")
    .map((d) => (d as { denomination?: string | null }).denomination ?? d.nom ?? "")
    .filter((n): n is string => n.trim() !== "");

// ---------------------------------------------------------------------------
// Faits, et mise en forme
// ---------------------------------------------------------------------------

export type Fait = { libelle: string; valeur: string; note?: string | null };

export const ancienneteAnnees = (
  d: Pick<DossierEntreprise, "date_creation">,
  maintenant: Date = new Date(),
): number | null => {
  if (!d.date_creation) return null;
  const creation = new Date(`${d.date_creation}T00:00:00Z`);
  if (Number.isNaN(creation.getTime())) return null;
  let ans = maintenant.getUTCFullYear() - creation.getUTCFullYear();
  const moisEcoules =
    maintenant.getUTCMonth() > creation.getUTCMonth() ||
    (maintenant.getUTCMonth() === creation.getUTCMonth() &&
      maintenant.getUTCDate() >= creation.getUTCDate());
  if (!moisEcoules) ans -= 1;
  return ans < 0 ? null : ans;
};

export const formatDate = (iso: string): string => {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return j && m && a ? `${j}/${m}/${a}` : iso;
};

/** Euros sans décimales : à ces montants, les centimes sont du bruit. */
export const formatEuros = (n: number): string =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/**
 * Les faits CONNUS de l'entreprise — et rien d'autre.
 *
 * Rend une liste, jamais un gabarit : un champ absent ne produit pas d'entrée,
 * donc l'affichage n'a aucune occasion de dessiner un tiret.
 */
export const faitsEntreprise = (
  d: DossierEntreprise,
  labelEffectif: (code: string | null) => string | null,
  maintenant: Date = new Date(),
): Fait[] => {
  const faits: Fait[] = [];

  const ans = ancienneteAnnees(d, maintenant);
  if (ans !== null) {
    faits.push({
      libelle: "Ancienneté",
      valeur: ans === 0 ? "moins d'un an" : `${ans} ans`,
      note: d.date_creation ? `créée le ${formatDate(d.date_creation)}` : null,
    });
  }

  // Le libellé vient d'une table de codes INSEE : '12' vaut « 20 à 49
  // salariés », jamais « 12 ».
  const effectif = labelEffectif(d.tranche_effectif_code);
  if (effectif) {
    faits.push({
      libelle: "Effectif",
      valeur: effectif,
      note: d.tranche_effectif_annee ? `source ${d.tranche_effectif_annee}` : null,
    });
  }

  if (d.categorie_entreprise) faits.push({ libelle: "Catégorie", valeur: d.categorie_entreprise });
  if (d.naf_code) faits.push({ libelle: "Activité (NAF)", valeur: d.naf_code });

  return faits;
};

/**
 * Les finances, si elles existent.
 *
 * Rend `null` quand il n'y a NI CA NI résultat — le bloc entier disparaît alors
 * de l'affichage, ce qui est le cas de 60 % des fiches. Les deux chiffres sont
 * indépendants : un CA absent avec un résultat connu est le cas le plus
 * fréquent, pas une anomalie.
 */
export const finances = (
  d: DossierEntreprise,
): { ca: string | null; resultat: string | null; exercice: number | null } | null => {
  if (d.chiffre_affaires === null && d.resultat_net === null) return null;
  return {
    ca: d.chiffre_affaires !== null ? formatEuros(d.chiffre_affaires) : null,
    resultat: d.resultat_net !== null ? formatEuros(d.resultat_net) : null,
    exercice: d.exercice_annee,
  };
};

/**
 * Le nom au registre, s'il diffère de celui du CRM.
 *
 * Rendre cette différence visible est utile au téléphone : on appelle « EMC »
 * une société qui répond « EDDIA Nouvelle Aquitaine », et savoir les deux évite
 * de passer pour quelqu'un qui s'est trompé de numéro.
 */
export const nomAuRegistre = (d: DossierEntreprise): string | null => {
  if (!d.denomination) return null;
  const normalise = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalise(d.denomination) === normalise(d.nom_crm ?? "") ? null : d.denomination;
};
