import { metierDuMotCle, type Metier } from "./metiers";

/**
 * Où aller chercher ensuite : les villes peuplées dont on n'a presque aucune
 * fiche.
 *
 * Tout est PUR ici — aucune requête, aucun `fetch`. La route API lit les trois
 * tables et passe les lignes ; ce fichier ne fait que les croiser. C'est
 * délibéré : le point fragile de ce calcul n'est pas la lecture mais le
 * RATTACHEMENT d'une adresse postale à une commune, et un rattachement qui
 * dérape ne lève aucune erreur — il affiche simplement Bordeaux comme vierge
 * alors qu'on y a déjà 29 fiches. Il faut donc pouvoir l'éprouver au test.
 */

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Forme comparable d'un nom de commune.
 *
 * Les deux graphies à réconcilier sont « Clermont-Ferrand » (base communes) et
 * « Clermont Ferrand » (frappé par un artisan dans son adresse Google) : le
 * tiret devient donc une espace, et non rien du tout — sans quoi
 * « Saint-Ouen » deviendrait « saintouen » et cesserait de ressembler à
 * « Saint Ouen ».
 */
export function normaliserCommune(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Code du département depuis le code INSEE.
 *
 * Deux chiffres partout, SAUF l'outre-mer où le département tient sur trois
 * (971 Guadeloupe, 974 La Réunion…). Découper à deux y mettrait la Guadeloupe
 * et Mayotte dans le même panier — et la règle « une ville par département »
 * n'en garderait qu'une pour tout l'outre-mer.
 */
export function departementDe(codeInsee: string): string {
  const code = String(codeInsee ?? "");
  return code.startsWith("97") || code.startsWith("98") ? code.slice(0, 3) : code.slice(0, 2);
}

/**
 * Code postal et commune lus dans une adresse Google.
 *
 * Google rend « 12 Rue Pascal, 77100 Meaux », mais aussi « Croas Ar Born,
 * 29420, Plouvorn » — la virgule après le code postal apparaît sur une adresse
 * sur dix. L'exiger absente perdait 475 fiches sur 3 825, soit un département
 * entier de couverture invisible.
 *
 * `null` quand l'adresse ne porte pas de code postal (Google en rend parfois
 * sans, et les adresses étrangères n'ont pas ce format).
 */
export function lireAdresse(adresse: string | null | undefined): { cp: string; ville: string } | null {
  if (!adresse) return null;
  const trouve = /(\d{5})\s*,?\s*(.+)$/.exec(String(adresse));
  if (!trouve) return null;
  const ville = trouve[2]
    // « 33049 Bordeaux Cedex », « 67624 Labège cedex » : la mention CEDEX est
    // une adresse de tri postal, pas un morceau du nom de la commune.
    .replace(/\s+cedex(\s+\d+)?\s*$/i, "")
    .trim();
  if (!ville) return null;
  return { cp: trouve[1], ville };
}

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

/** Une commune candidate, telle que la rend `communes_fr`. */
export type CommuneCandidate = {
  code: string;
  nom: string;
  population: number;
  lat: number;
  lon: number;
  codesPostaux: readonly string[];
};

/** Une ligne d'`entreprises_raw`, réduite à ce que le calcul consomme. */
export type FicheBrute = {
  adresse: string | null;
  keyword: string | null;
};

/** Une recherche déjà lancée, telle que la rend `crawl_jobs`. */
export type RecherchePassee = {
  /** `metadata.location`, p. ex. « Limoges, France ». */
  lieu: string;
  /** `metadata.businessTypes`. */
  motsCles: readonly string[];
  /** `true` quand la passe n'a visité qu'une poignée de zones (mode 80/20). */
  rapide: boolean;
};

// ---------------------------------------------------------------------------
// Rattachement d'une fiche à une commune
// ---------------------------------------------------------------------------

/**
 * Index (code postal + nom) → commune.
 *
 * LE CODE POSTAL NE SUFFIT PAS, et le nom non plus. Un code postal couvre
 * souvent plusieurs communes, et trois communes s'appellent « Mérignac » (78 090
 * habitants en Gironde, 805 en Charente, 237 en Charente-Maritime). Croiser les
 * deux lève l'ambiguïté dans les deux sens.
 */
export function indexerCommunes(communes: readonly CommuneCandidate[]): Map<string, CommuneCandidate> {
  const index = new Map<string, CommuneCandidate>();
  for (const commune of communes) {
    const nom = normaliserCommune(commune.nom);
    for (const cp of commune.codesPostaux) {
      index.set(`${cp}|${nom}`, commune);
    }
  }
  return index;
}

/**
 * Combien de fiches par commune, pour ce métier.
 *
 * Les fiches d'un autre métier ne comptent pas : une ville ratissée pour la
 * climatisation reste vierge en plomberie, et l'afficher comme couverte
 * reviendrait à ne jamais y retourner.
 */
export function compterFiches(
  fiches: readonly FicheBrute[],
  index: Map<string, CommuneCandidate>,
  metier: Metier,
): Map<string, number> {
  const parCommune = new Map<string, number>();
  for (const fiche of fiches) {
    if (metierDuMotCle(fiche.keyword) !== metier) continue;
    const lue = lireAdresse(fiche.adresse);
    if (!lue) continue;
    const commune = index.get(`${lue.cp}|${normaliserCommune(lue.ville)}`);
    if (!commune) continue;
    parCommune.set(commune.code, (parCommune.get(commune.code) ?? 0) + 1);
  }
  return parCommune;
}

/**
 * Combien de fiches, pour 100 000 habitants, dans les villes où l'on a
 * réellement cherché ce métier ?
 *
 * C'est notre propre production qui sert d'étalon, pas un chiffre inventé : on
 * n'a aucun moyen de savoir combien de plombiers existe à Nantes, mais on sait
 * combien on en trouve d'ordinaire par habitant. La MÉDIANE, et non la moyenne :
 * Perpignan pèse 70 fiches pour 120 000 habitants, six fois la densité
 * habituelle, et tirerait à elle seule l'étalon vers le haut.
 *
 * `null` quand ce métier n'a jamais rien rendu — il n'y a alors rien à étalonner.
 */
export function densiteReference(
  fichesParCommune: Map<string, number>,
  communes: readonly CommuneCandidate[],
): number | null {
  const densites: number[] = [];
  for (const commune of communes) {
    const n = fichesParCommune.get(commune.code) ?? 0;
    if (n <= 0 || commune.population <= 0) continue;
    densites.push((n * 1e5) / commune.population);
  }
  if (densites.length === 0) return null;
  densites.sort((a, b) => a - b);
  const milieu = Math.floor(densites.length / 2);
  return densites.length % 2 === 1
    ? densites[milieu]
    : (densites[milieu - 1] + densites[milieu]) / 2;
}

/**
 * Densité retenue quand le métier n'a encore rien rendu nulle part.
 *
 * La valeur exacte n'a alors aucune importance : sans aucune fiche, `manque`
 * vaut `densité × population` pour toutes les villes, et le classement se
 * réduit à l'ordre des populations — ce qui est exactement la bonne réponse à
 * « où chercher en premier ? » quand on part de zéro.
 */
const DENSITE_A_DEFAUT = 20;

// ---------------------------------------------------------------------------
// Ce qui a déjà été fait
// ---------------------------------------------------------------------------

export type EtatPassage = "jamais" | "rapide" | "complete";

/**
 * Ce qu'on a déjà lancé sur chaque commune pour ce métier.
 *
 * Le lieu d'une recherche est une chaîne saisie à la main (« Limoges, France »),
 * jamais un code INSEE : on la rapproche par le nom, ce qui laisse une
 * ambiguïté sur les deux seuls homonymes de plus de 20 000 habitants
 * (Saint-Denis 93 / La Réunion, Saint-Louis 68 / La Réunion). Conséquence
 * assumée : chercher l'un marque l'autre comme fait. Une carte de trop en
 * moins, jamais une recherche perdue.
 */
export function passagesParCommune(
  recherches: readonly RecherchePassee[],
  communes: readonly CommuneCandidate[],
  metier: Metier,
): Map<string, EtatPassage> {
  const parNom = new Map<string, string[]>();
  for (const commune of communes) {
    const nom = normaliserCommune(commune.nom);
    parNom.set(nom, [...(parNom.get(nom) ?? []), commune.code]);
  }

  const etats = new Map<string, EtatPassage>();
  for (const recherche of recherches) {
    if (!recherche.motsCles.some((mot) => metierDuMotCle(mot) === metier)) continue;
    // « Limoges, France » → « limoges ». Google Places rend toujours le nom en
    // tête, la suite étant le département puis le pays.
    const nom = normaliserCommune(String(recherche.lieu ?? "").split(",")[0] ?? "");
    if (!nom) continue;
    for (const code of parNom.get(nom) ?? []) {
      // Une passe complète l'emporte sur une passe rapide, quel que soit
      // l'ordre des lignes : la ville a bel et bien été ratissée une fois.
      if (etats.get(code) === "complete") continue;
      etats.set(code, recherche.rapide ? "rapide" : "complete");
    }
  }
  return etats;
}

// ---------------------------------------------------------------------------
// Le classement
// ---------------------------------------------------------------------------

export type SuggestionVille = {
  code: string;
  nom: string;
  departement: string;
  population: number;
  lat: number;
  lon: number;
  /** Premier code postal de la commune. Ne sert qu'à lever une homonymie. */
  codePostal: string;
  /**
   * `true` si une autre commune de la liste porte le même nom.
   *
   * Le scraper ne reçoit pas un code INSEE mais une chaîne à géocoder. « Saint-
   * Denis, France » rend la ville de Seine-Saint-Denis, jamais celle de La
   * Réunion — deux communes de plus de 20 000 habitants sont dans ce cas
   * (Saint-Denis, Saint-Louis). L'écran ajoute alors le code postal au lieu
   * cherché, ce qu'il ne peut pas faire partout : « Marseille, 13001, France »
   * ferait géocoder le 1ᵉʳ arrondissement au lieu de la ville entière.
   */
  homonyme: boolean;
  /** Fiches déjà en base pour cette ville ET ce métier. */
  fiches: number;
  /** Fiches qu'on s'attend à y trouver, d'après notre propre densité. */
  attendu: number;
  /** `attendu − fiches`, plancher à zéro. C'est le critère de tri. */
  manque: number;
  passage: EtatPassage;
};

/**
 * Le lieu à envoyer au scraper. C'est une chaîne à géocoder, pas un identifiant :
 * elle doit être aussi précise que nécessaire, et pas davantage.
 */
export function lieuDeRecherche(ville: Pick<SuggestionVille, "nom" | "codePostal" | "homonyme">): string {
  return ville.homonyme && ville.codePostal
    ? `${ville.nom}, ${ville.codePostal}, France`
    : `${ville.nom}, France`;
}

export type OptionsClassement = {
  communes: readonly CommuneCandidate[];
  fiches: readonly FicheBrute[];
  recherches: readonly RecherchePassee[];
  metier: Metier;
  /**
   * Longueur maximale du classement rendu. Le TOTAL avant coupe reste lisible
   * par `compterVillesAProspecter` : une liste tronquée en silence ferait
   * croire le vivier épuisé alors qu'il reste des villes derrière.
   */
  limite?: number;
};

/**
 * Toutes les villes qui manquent, dans l'ordre où les attaquer.
 *
 * LE CLASSEMENT NE TRONQUE RIEN — il ENTRELACE. Trié sur le seul manque, il
 * rendrait Paris, Boulogne-Billancourt, Saint-Denis, Argenteuil, Montreuil… :
 * douze cartes dans la même agglomération, dont les tuiles se recouvrent et
 * rendent les mêmes entreprises. Ne garder qu'une ville par département
 * corrigeait bien le début de liste, mais amputait le reste — les 388 autres
 * villes disparaissaient, et il n'y avait donc pas de page deux.
 *
 * On classe donc les villes de chaque département entre elles, et on sert
 * d'abord toutes les premières, puis toutes les deuxièmes, et ainsi de suite.
 * La première page balaie la France, la neuvième revient sur la deuxième ville
 * de chaque département, et aucune n'est perdue en chemin.
 */
export function classerVilles({
  communes,
  fiches,
  recherches,
  metier,
  // Assez haut pour ne rien couper au seuil des 20 000 habitants (484 communes
  // en France) : c'est la ROUTE qui décide de ce qu'elle rend, pas le calcul.
  limite = 1000,
}: OptionsClassement): SuggestionVille[] {
  const index = indexerCommunes(communes);
  const fichesParCommune = compterFiches(fiches, index, metier);
  const densite = densiteReference(fichesParCommune, communes) ?? DENSITE_A_DEFAUT;
  const passages = passagesParCommune(recherches, communes, metier);

  const homonymes = new Set<string>();
  const vus = new Set<string>();
  for (const commune of communes) {
    const nom = normaliserCommune(commune.nom);
    if (vus.has(nom)) homonymes.add(nom);
    vus.add(nom);
  }

  const classees = communes
    .map((commune): SuggestionVille => {
      const dejaLa = fichesParCommune.get(commune.code) ?? 0;
      const attendu = (densite * commune.population) / 1e5;
      return {
        code: commune.code,
        nom: commune.nom,
        departement: departementDe(commune.code),
        population: commune.population,
        lat: commune.lat,
        lon: commune.lon,
        codePostal: commune.codesPostaux[0] ?? "",
        homonyme: homonymes.has(normaliserCommune(commune.nom)),
        fiches: dejaLa,
        attendu: Math.round(attendu),
        manque: Math.max(0, Math.round(attendu - dejaLa)),
        passage: passages.get(commune.code) ?? "jamais",
      };
    })
    // Une ville déjà ratissée en entier pour ce métier n'a plus rien à offrir :
    // la reproposer ferait rejouer une heure de crawl pour zéro fiche neuve.
    .filter((v) => v.passage !== "complete")
    .filter((v) => v.manque > 0)
    .sort((a, b) => b.manque - a.manque || b.population - a.population);

  // Rang de chaque ville DANS son département : 0 pour celle qui y manque le
  // plus. C'est ce rang qui passe devant le manque au tri final.
  const rangs = new Map<string, number>();
  const vusParDepartement = new Map<string, number>();
  for (const ville of classees) {
    const rang = vusParDepartement.get(ville.departement) ?? 0;
    rangs.set(ville.code, rang);
    vusParDepartement.set(ville.departement, rang + 1);
  }

  return classees
    .slice()
    .sort(
      (a, b) =>
        (rangs.get(a.code) ?? 0) - (rangs.get(b.code) ?? 0) ||
        b.manque - a.manque ||
        b.population - a.population,
    )
    .slice(0, limite);
}
