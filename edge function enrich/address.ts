// =====================================================================
// Ville et code postal lus dans l'adresse (pur, sans I/O)
// =====================================================================
// Une adresse complète porte déjà la commune et son code postal — « 12 rue des
// Lilas, 21800 Quetigny ». L'enrichissement ne les en tirait pourtant jamais :
// il n'écrivait ni `entreprises.ville` ni `entreprises.code_postal`, si bien
// qu'une fiche dont l'adresse contenait les deux mot pour mot ressortait
// « incomplète » sur ces deux champs, bloquait la création du site, et
// n'attendait plus qu'un humain pour recopier ce qui était déjà là.
//
// Ce module ne fait AUCUN accès réseau ni base : il lit une chaîne et rend ce
// qu'il y a trouvé. La confrontation au référentiel `communes_fr` — qui rend
// l'orthographe officielle avec ses accents — est dans `db.ts`, comme le reste
// des lectures. Ce découpage rend la règle de lecture entièrement testable.
//
// Parti pris général : ne rien rendre plutôt que rendre faux. Un code postal
// erroné se propage à la ville SEO, aux zones desservies, puis à toutes les
// pages du site, sans que personne ne le voie ; un champ resté vide, lui,
// s'affiche en rouge sur la fiche et se corrige en dix secondes.
// =====================================================================

export interface AddressLocality {
  /** Code postal français à 5 chiffres, ou null. */
  code_postal: string | null;
  /** Commune telle qu'écrite dans l'adresse, casse normalisée, ou null. */
  ville: string | null;
}

const NOTHING: AddressLocality = { code_postal: null, ville: null };

/**
 * Mots qui ouvrent une voie ou un complément d'adresse, et ne peuvent donc pas
 * commencer un nom de commune.
 *
 * Volontairement court : il ne sert qu'au repli « le nom précède le code
 * postal » (« Quetigny 21800 »), le seul cas où l'on risque de prendre la rue
 * pour la ville. Les mots ambigus en sont exclus à dessein — « Cours »,
 * « Le Port », « Pont-à-Mousson » sont de vraies communes, les inscrire ici
 * ferait perdre des villes correctes pour se prémunir d'un cas qui ne se
 * présente pas.
 */
const NON_CITY_WORDS = new Set([
  "rue", "avenue", "av", "boulevard", "bd", "chemin", "route", "rte", "impasse",
  "allee", "allees", "voie", "sentier", "passage", "square", "ruelle", "venelle",
  "za", "zi", "zac", "zone", "lotissement", "residence", "batiment", "bat",
  "immeuble", "etage", "appartement", "appt", "apt", "bp", "cs", "cedex", "tsa",
  "faubourg", "fbg", "hameau", "lieu", "lieudit", "montee", "traverse",
  "esplanade", "promenade", "rocade", "autoroute", "peripherique",
  "tel", "tel.", "fax", "siret", "siren", "chez",
]);

/** Pays écrits en fin d'adresse : jamais la commune. */
const COUNTRY_WORDS = new Set(["france", "fr", "francia", "frankreich"]);

/**
 * Particules qui restent en minuscules dans un nom de commune français, sauf en
 * tête (« Le Mans » garde sa majuscule, « Nogent-le-Rotrou » non).
 */
const PARTICLES = new Set([
  "de", "du", "des", "d", "le", "la", "les", "l", "au", "aux", "en", "et",
  "sur", "sous", "lez", "les", "à",
]);

/**
 * Vrai pour un code postal français plausible.
 *
 * Le préfixe départemental va de 01 à 98 : « 00xxx » n'existe pas, et « 99xxx »
 * est la convention INSEE pour l'étranger. Le reste est laissé au référentiel
 * `communes_fr`, qui tranchera bien mieux qu'une plage de valeurs.
 */
export function isFrenchPostalCode(value: string | null | undefined): boolean {
  const s = (value ?? "").trim();
  if (!/^\d{5}$/.test(s)) return false;
  const dept = Number(s.slice(0, 2));
  return dept >= 1 && dept <= 98;
}

/** Nom de commune réduit à sa forme comparable : accents, casse, ponctuation. */
export function normalizeCommuneName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Remet une casse française sur un nom crié en capitales (« SAINT-ETIENNE » →
 * « Saint-Etienne »). Un nom déjà en casse mixte est rendu tel quel : c'est
 * probablement celui que l'entreprise écrit elle-même.
 *
 * Les accents perdus par les capitales ne sont pas devinés ici — c'est le
 * rapprochement avec `communes_fr` qui rend « Saint-Étienne ».
 */
export function titleCaseCommune(value: string): string {
  if (/[a-zà-öø-ÿ]/.test(value)) return value;
  let first = true;
  return value.toLowerCase().replace(/[^\s\-']+/g, (word) => {
    const keepLower = !first && PARTICLES.has(word);
    first = false;
    return keepLower ? word : word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/** Retours à la ligne et séparateurs exotiques ramenés à des virgules. */
function flatten(raw: string): string {
  return raw
    .replace(/[\r\n\t•|]+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Portion d'une chaîne jusqu'au premier séparateur de segment. */
function firstSegment(s: string): string {
  const cut = s.search(/[,;]/);
  return cut === -1 ? s : s.slice(0, cut);
}

/** Portion d'une chaîne après le dernier séparateur de segment. */
function lastSegment(s: string): string {
  const cut = Math.max(s.lastIndexOf(","), s.lastIndexOf(";"));
  return cut === -1 ? s : s.slice(cut + 1);
}

/** Segments non vides qui suivent le premier séparateur d'une chaîne. */
function followingSegments(s: string): string[] {
  const cut = s.search(/[,;]/);
  if (cut === -1) return [];
  return s
    .slice(cut + 1)
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Nettoie un candidat commune : parenthèses, mentions postales, coordonnées,
 * pays, ponctuation de bordure. Rend null si ce qui reste ne peut pas être un
 * nom de commune.
 *
 * La coupe au premier chiffre est le nettoyage le plus utile : aucune commune
 * française n'en porte, donc tout ce qui suit est du bruit resté collé — un
 * « Cedex 3 », un numéro de bâtiment, un téléphone recopié à la suite. Couper
 * plutôt que rejeter sauve les cas où le nom est bien là mais suivi d'autre
 * chose (« 21800 Quetigny Tél 03 80 … » rend « Quetigny »).
 */
function cleanCommuneCandidate(raw: string): string | null {
  let s = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bc[eé]dex\b.*$/i, " ")
    // Étiquettes de contact : elles ferment l'adresse, et ce qui suit n'est
    // jamais une commune.
    .replace(/\b(t[ée]l[ée]phone|t[ée]l|tel|fax|mobile|portable|siret|siren|rcs|e-?mail)\b\.?.*$/i, " ")
    .replace(/\b(bp|cs|tsa)\b\s*\d*/gi, " ")
    .replace(/\d[\s\S]*$/, " ")
    .replace(/\s+/g, " ")
    .trim();

  // « Quetigny France » : le pays ferme l'adresse, jamais le nom de la commune.
  s = s.replace(/\s+(france|fr)\s*$/i, "").trim();

  s = s.replace(/^[\s.,;:/\\_-]+/, "").replace(/[\s.,;:/\\_'-]+$/, "").trim();

  if (s.length < 2) return null;
  if (!/[a-zA-Zà-öø-ÿ]/.test(s)) return null;

  const normalized = normalizeCommuneName(s);
  if (!normalized) return null;
  if (COUNTRY_WORDS.has(normalized)) return null;

  return s;
}

/** Vrai si le candidat porte un mot de voie — donc n'est pas une commune. */
function looksLikeStreet(candidate: string): boolean {
  const normalized = normalizeCommuneName(candidate);
  if (!normalized) return true;
  return normalized.split(" ").some((word) => NON_CITY_WORDS.has(word));
}

/**
 * Lit le code postal et la commune dans une adresse française.
 *
 * Le code postal sert d'ancre : en France il précède la commune et ferme
 * l'adresse. On retient le DERNIER groupe de cinq chiffres — « BP 45, 21801
 * Quetigny Cedex, 21800 Quetigny » doit rendre le code de la commune, pas celui
 * de la boîte postale.
 *
 * La commune est cherchée dans cet ordre, le premier candidat valable gagne :
 *   1. la fin du segment qui porte le code postal   — « …, 21800 Quetigny »
 *   2. les segments suivants                        — « …, 21800, Quetigny »
 *   3. le début du segment, avant le code postal    — « …, Quetigny 21800 »
 *
 * Le troisième est le seul qui puisse confondre la rue et la ville : lui seul
 * est filtré par `looksLikeStreet`.
 *
 * Sans code postal, rien n'est rendu. Chercher une commune à l'aveugle dans une
 * chaîne libre reviendrait à prendre le dernier segment pour un nom de ville —
 * ce qui, sur « 12 rue des Lilas », écrirait la rue dans le champ ville.
 */
export function parseFrenchAddress(raw: string | null | undefined): AddressLocality {
  const text = flatten(raw ?? "");
  if (!text) return NOTHING;

  // `\d+` est gourmand : un téléphone (« 0380123456 ») ou un SIRET rendent un
  // groupe de 10 ou 14 chiffres, écarté par le test de longueur. Aucun besoin
  // d'assertions arrière, que la cible ES2017 ne garantit pas partout.
  const digits = /\d+/g;
  let codePostal: string | null = null;
  let start = -1;
  let end = -1;
  let match: RegExpExecArray | null;
  while ((match = digits.exec(text)) !== null) {
    if (match[0].length !== 5 || !isFrenchPostalCode(match[0])) continue;
    codePostal = match[0];
    start = match.index;
    end = match.index + match[0].length;
  }
  if (!codePostal) return NOTHING;

  const tail = text.slice(end);

  const sameSegment = cleanCommuneCandidate(firstSegment(tail));
  if (sameSegment) return { code_postal: codePostal, ville: titleCaseCommune(sameSegment) };

  for (const segment of followingSegments(tail)) {
    const candidate = cleanCommuneCandidate(segment);
    if (candidate) return { code_postal: codePostal, ville: titleCaseCommune(candidate) };
  }

  const before = cleanCommuneCandidate(lastSegment(text.slice(0, start)));
  if (before && !looksLikeStreet(before)) {
    return { code_postal: codePostal, ville: titleCaseCommune(before) };
  }

  return { code_postal: codePostal, ville: null };
}
