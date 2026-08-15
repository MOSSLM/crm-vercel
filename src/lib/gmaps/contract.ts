import { z } from "zod";

/**
 * CONTRAT PARTAGÉ CRM ↔ SCRAPER GoogleMapsScrape.
 *
 * ⚠️ Ce fichier a un JUMEAU : `GoogleMapsScrape/server.js` (routes `POST /crawl`,
 * `GET /crawl/:jobId` et son alias `GET /job/:jobId`). Les deux dépôts sont
 * déployés séparément (Vercel d'un côté, ECS Fargate de l'autre) et rien ne les
 * compile ensemble : si l'un des deux bouge sans l'autre, la recherche casse en
 * silence — c'est exactement ce qui s'était produit (port, en-têtes d'auth,
 * corps de requête, chemin de suivi et forme de réponse divergeaient tous).
 *
 * Règle : toute modification ici doit être répercutée dans `server.js`, et
 * réciproquement. Les schémas ci-dessous sont la seule source de vérité côté CRM,
 * utilisée à la fois pour valider CE QUI ENTRE (corps du POST venant du
 * navigateur) et CE QUI SORT du scraper (réponses relayées vers le navigateur).
 */

/** Pas de tuilage par défaut — même valeur que `DEFAULT_TILE_STEP` côté serveur. */
export const DEFAULT_TILE_STEP = 0.05;

/**
 * `""` (champ vide d'un `<input type="number">` non typé) doit valoir « absent »,
 * pas `NaN` : sans ça un champ masqué et vidé bloque le formulaire sans message.
 */
const videVersIndefini = (v: unknown) => (v === "" || v === null ? undefined : v);

// ---------------------------------------------------------------------------
// CONTRAT 3 — corps de POST /crawl
// ---------------------------------------------------------------------------

/**
 * Ce que le scraper exige, mot pour mot. `businessTypes` est un tableau NON VIDE :
 * le serveur répond 400 sinon.
 */
export const CrawlRequestSchema = z.object({
  location: z.string().min(1, "location est requis"),
  businessTypes: z
    .array(z.string().min(1))
    .min(1, "businessTypes doit contenir au moins un type d'activité"),
  useMaps: z.boolean(),
  useSearch: z.boolean(),
  pagesCount: z.number().int().min(0),
  tileStep: z.number().positive(),
  /**
   * Autorise le scraper a appeler les API Google PAYANTES : geocodage de la
   * ville, et surtout le repli Places API sur les avis — celui-la se facture
   * PAR ENTREPRISE consultee. Faux par defaut : une recherche ne doit jamais
   * couter d'argent sans que ca ait ete demande.
   */
  useGoogleApi: z.boolean(),
  /**
   * PASSE RAPIDE : ne parcourir que les N tuiles les plus écartées les unes des
   * autres, au lieu de toute la grille. 0 = exploration complète.
   *
   * Ce n'est pas un échantillon au hasard : le robot range ses tuiles du plus
   * éloigné au plus proche de ce qu'il a déjà vu, et Google rend largement les
   * mêmes entreprises pour deux tuiles voisines. Garder les premières, c'est
   * couvrir la ville avec le moins de recouvrement possible — l'essentiel des
   * entreprises pour une fraction du temps.
   */
  tuilesMax: z.number().int().min(0).max(500),
});

export type CrawlRequest = z.infer<typeof CrawlRequestSchema>;

/**
 * Ce que le CRM accepte en entrée, plus large que ce qu'il émet : `keyword`
 * (chaîne unique) est toléré comme alias historique de `businessTypes`, et les
 * options ont des valeurs par défaut. Le `.pipe()` final garantit que le résultat
 * satisfait le CONTRAT 3 — donc qu'aucun corps invalide ne part vers le scraper.
 */
export const CrawlRequestInputSchema = z
  .object({
    location: z.string().min(1, "location est requis"),
    businessTypes: z.array(z.string().min(1)).optional(),
    /** Alias historique : un seul mot-clé. Converti en `businessTypes: [keyword]`. */
    keyword: z.string().min(1).optional(),
    useMaps: z.boolean().optional(),
    useSearch: z.boolean().optional(),
    pagesCount: z.preprocess(
      videVersIndefini,
      z.coerce.number().int().min(0).optional(),
    ),
    tileStep: z.preprocess(
      videVersIndefini,
      z.coerce.number().positive().optional(),
    ),
    useGoogleApi: z.boolean().optional(),
    tuilesMax: z.preprocess(
      videVersIndefini,
      z.coerce.number().int().min(0).max(500).optional(),
    ),
  })
  .transform((entree) => ({
    location: entree.location,
    businessTypes:
      entree.businessTypes && entree.businessTypes.length > 0
        ? entree.businessTypes
        : entree.keyword
          ? [entree.keyword]
          : [],
    useMaps: entree.useMaps ?? false,
    useSearch: entree.useSearch ?? false,
    pagesCount: entree.pagesCount ?? 0,
    tileStep: entree.tileStep ?? DEFAULT_TILE_STEP,
    // Defaut FAUX, et volontairement pas configurable par variable
    // d'environnement : le seul moyen de declencher une facturation est de
    // cocher la case dans le formulaire.
    useGoogleApi: entree.useGoogleApi ?? false,
    // 0 par défaut : ne rien sauter tant qu'on ne l'a pas demandé.
    tuilesMax: entree.tuilesMax ?? 0,
  }))
  .pipe(CrawlRequestSchema);

// ---------------------------------------------------------------------------
// CONTRAT 2 — réponses du scraper
// ---------------------------------------------------------------------------

export const JobStatusEnum = z.enum([
  "pending",
  "running",
  "done",
  "partial",
  "error",
]);

export type JobStatusValue = z.infer<typeof JobStatusEnum>;

/** États après lesquels plus rien ne bougera : on arrête le polling ET on éteint le service. */
export const TERMINAL_JOB_STATUSES = ["done", "partial", "error"] as const;

export const estStatutTerminal = (statut: string | null | undefined): boolean =>
  !!statut && (TERMINAL_JOB_STATUSES as readonly string[]).includes(statut);

/** Réponse de `POST /crawl`. `status` est optionnel côté serveur : on le comble. */
export const CrawlResponseSchema = z.object({
  jobId: z.string().min(1),
  status: JobStatusEnum.default("pending"),
});

export type CrawlResponse = z.infer<typeof CrawlResponseSchema>;

/**
 * Compteur du statut : absent → 0 (le scraper ne renseigne les compteurs qu'une
 * fois le job démarré), mais un type incohérent reste une erreur lisible plutôt
 * qu'un `undefined` qui s'afficherait « NaN » dans le tableau de résultats.
 */
const compteur = z.coerce.number().int().min(0).default(0);

/**
 * Message d'erreur du job. Le CONTRAT 2 impose une chaîne ; on tolère l'ancienne
 * forme `{ message, stack, metadata }` de `jobManager.js` pour ne pas rendre le
 * suivi illisible tant que le scraper n'est pas redéployé.
 */
const messageErreur = z.preprocess((v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (
    typeof v === "object" &&
    typeof (v as { message?: unknown }).message === "string"
  ) {
    return (v as { message: string }).message;
  }
  return String(v);
}, z.string().nullable());

/**
 * Dictionnaire optionnel du statut. `.default({})` seul acceptait la CLÉ ABSENTE
 * mais REJETAIT `null` (« expected record, received null ») : le suivi entier
 * partait alors en `statut_scraper_invalide` (502) pour un champ décoratif, là où
 * `error` tolère explicitement `null`. On aligne les deux tolérances : absent,
 * `null` et `undefined` valent tous « dictionnaire vide ». Un type franchement
 * incohérent (un nombre, une chaîne) reste refusé.
 */
const dictionnaireTolerant = (v: unknown) =>
  v === null || v === undefined ? {} : v;

// ---------------------------------------------------------------------------
// CONTRAT 5 — géométrie du suivi (carte de la recherche en cours)
// ---------------------------------------------------------------------------

/**
 * La grille de tuiles réellement parcourue, annoncée une seule fois par le
 * scraper (`tilesPlanned`) dès qu'il l'a calculée.
 *
 * On reçoit les DEUX tableaux de coordonnées, et non un coin plus un pas : la
 * dernière rangée et la dernière colonne n'ont presque jamais la taille des
 * autres (le cadre de la ville tombe rarement sur un multiple exact du pas).
 * Reconstruire la grille par multiplication dessinerait des tuiles fausses sur
 * les bords, c'est-à-dire exactement là où l'on regarde si la zone est couverte.
 *
 * `latitudes` va du nord au sud, `longitudes` d'ouest en est — l'ordre dans
 * lequel le crawler numérote ses tuiles.
 */
export const GrilleSchema = z.object({
  latitudes: z.array(z.number()).min(2),
  longitudes: z.array(z.number()).min(2),
  rangees: z.number().int().positive(),
  colonnes: z.number().int().positive(),
  total: z.number().int().positive(),
  tileStep: z.number().positive().nullable().default(null),
  /** D'où vient le cadre : `openstreetmap`, `communes_fr`, `google`. */
  source: z.string().nullable().default(null),
  /** Libellé complet du lieu tel qu'OpenStreetMap l'a reconnu. */
  nomLieu: z.string().nullable().default(null),
  /**
   * Numéros des tuiles que cette passe compte visiter. Sur une exploration
   * complète, c'est toute la grille ; sur une passe rapide, c'est ce qui
   * distingue une tuile SAUTÉE d'une tuile pas encore atteinte — et donc ce
   * qui permettra d'y revenir.
   */
  tuilesPrevues: z.array(z.number().int().positive()).default([]),
});

export type Grille = z.infer<typeof GrilleSchema>;

/**
 * Contour d'une commune. On ne valide QUE ce qu'on dessine — le type et un
 * tableau de coordonnées — sans décrire la récursivité complète du GeoJSON :
 * un schéma trop strict ferait tomber tout le suivi en 502 pour un anneau mal
 * formé, là où le rendu se contente d'ignorer une géométrie qu'il ne sait pas
 * tracer.
 */
export const ContourSchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.unknown()).min(1),
});

export type Contour = z.infer<typeof ContourSchema>;

/** Une entreprise trouvée, telle qu'on la pose sur la carte. */
export const PointRechercheSchema = z.object({
  nom: z.string().default(""),
  lat: z.number(),
  lng: z.number(),
  /** Vrai = ligne réellement écrite ; faux = doublon fusionné. */
  nouveau: z.boolean().default(false),
  /** Numéro de la tuile qui l'a trouvée (1-indexé), null si inconnu. */
  tuile: z.number().int().nullable().default(null),
});

export type PointRecherche = z.infer<typeof PointRechercheSchema>;

/**
 * Un point aberrant ne doit pas emporter tout le suivi. Zod rejette un tableau
 * entier dès qu'un élément ne valide pas : une seule fiche aux coordonnées
 * illisibles ferait alors répondre 502 « statut_scraper_invalide » et figerait
 * la barre de progression d'un crawl parfaitement sain. On écarte les intrus en
 * amont — c'est de la donnée d'illustration, pas un compteur.
 */
const filtrerPoints = (v: unknown) => {
  if (!Array.isArray(v)) return [];
  return v.filter((p) => {
    if (!p || typeof p !== "object") return false;
    const { lat, lng } = p as { lat?: unknown; lng?: unknown };
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    // (0, 0) est une coordonnée valide dans l'absolu, jamais pour une entreprise
    // française : c'est la signature d'une donnée manquante. Le scraper l'écarte
    // déjà à la source ; on le refait ici parce que les deux dépôts sont
    // déployés séparément et que ce CRM peut parler à une version antérieure.
    return !(lat === 0 && lng === 0);
  });
};

/**
 * Statut d'un job, À PLAT. Les compteurs étaient auparavant enfouis dans
 * `result.mapsStats['<businessType>'].found`, ce que le CRM lisait à la racine —
 * d'où des `undefined` affichés comme 0 en permanence.
 */
export const JobStatusSchema = z.object({
  jobId: z.string().min(1),
  status: JobStatusEnum,
  /** Fiches distinctes vues. */
  found: compteur,
  /** Lignes réellement écrites en base. */
  inserted: compteur,
  /** Lignes absorbées par le trigger de dédoublonnage. */
  merged: compteur,
  /** = `inserted`, gardé pour compatibilité. */
  saved: compteur,
  pages: compteur,
  tilesDone: compteur,
  /**
   * Position dans la GRILLE de la tuile lue à l'instant — à ne pas confondre
   * avec `tilesDone`, qui est un compte. Les deux ont divergé le jour où les
   * tuiles ont cessé d'être parcourues rangée par rangée : le robot va
   * désormais à chaque étape sur la tuile la plus éloignée de celles déjà
   * faites, ce qui maximise les entreprises distinctes trouvées tôt.
   */
  tuileEnCours: compteur,
  tilesTotal: compteur,
  /**
   * CONTRAT 5. Les quatre champs suivants ont TOUS une valeur par défaut, et ce
   * n'est pas de la coquetterie : le scraper et le CRM sont déployés
   * séparément. Sans défaut, le premier déploiement du CRM ferait répondre 502 à
   * tout suivi tant que la machine du scraper n'a pas été redémarrée — un
   * crawl sain, invisible. Absents, la carte ne s'affiche simplement pas.
   */
  grille: GrilleSchema.nullable().default(null),
  /**
   * Silhouette de la commune explorée (GeoJSON allégé côté scraper : Limoges
   * passe de 3 251 sommets et 74 Ko à 457 sommets et 7,7 Ko, pour 22 m d'écart
   * — un pixel à l'échelle d'une ville).
   *
   * N'arrive QUE sur demande (`?avecContour=1`) : il ne change jamais, et le
   * renvoyer toutes les 3 s coûterait des mégaoctets sur un réseau mobile. Le
   * client le garde donc de son côté une fois reçu.
   */
  contour: ContourSchema.nullable().default(null),
  /**
   * Fiches par tuile, indexé sur (numéro de tuile − 1). `null` = tuile pas
   * encore parcourue, `0` = parcourue et vide. La carte doit distinguer les deux.
   */
  tuiles: z.array(z.number().int().nullable()).default([]),
  /** Points reçus DEPUIS `pointsDepuis` — pas la liste complète (suivi incrémental). */
  points: z.preprocess(filtrerPoints, z.array(PointRechercheSchema)).default([]),
  /** Index du premier point de `points` dans la liste complète. */
  pointsDepuis: compteur,
  /** Taille de la liste complète côté scraper : dit au client s'il a tout reçu. */
  pointsTotal: compteur,
  /** businessType -> uuid de la ligne `recherches`. */
  rechercheIds: z.preprocess(dictionnaireTolerant, z.record(z.string(), z.string())),
  error: messageErreur,
  metadata: z.preprocess(dictionnaireTolerant, z.record(z.string(), z.unknown())),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;

// ---------------------------------------------------------------------------
// CONTRAT 6 — la file d'attente
// ---------------------------------------------------------------------------

/**
 * Une recherche vue depuis la file. Volontairement maigre : ni points, ni
 * contour, ni grille. C'est de quoi écrire une ligne de liste, pas de quoi
 * dessiner une carte — celle-ci ne se charge que pour la recherche affichée.
 */
export const JobEnFileSchema = z.object({
  jobId: z.string().min(1),
  status: JobStatusEnum,
  location: z.string().default(""),
  businessTypes: z.array(z.string()).default([]),
  found: compteur,
  inserted: compteur,
  merged: compteur,
  tilesDone: compteur,
  tilesTotal: compteur,
});

export type JobEnFile = z.infer<typeof JobEnFileSchema>;

/**
 * Un job illisible ne doit pas emporter toute la file : on écarte l'intrus et
 * on affiche les autres, plutôt que de laisser l'écran sans aucune liste.
 */
export const FileJobsSchema = z.object({
  jobs: z.preprocess((v) => {
    if (!Array.isArray(v)) return [];
    return v.filter((j) => JobEnFileSchema.safeParse(j).success);
  }, z.array(JobEnFileSchema)),
});

// ---------------------------------------------------------------------------
// CONTRAT 7 — les villes à prospecter
// ---------------------------------------------------------------------------

/**
 * Une ville proposée par `/api/gmaps/suggestions`.
 *
 * Contrairement aux six contrats précédents, celui-ci ne traverse PAS la
 * frontière des deux dépôts : la route et l'écran sont livrés ensemble. Le
 * schéma reste là pour la même raison que les autres — un champ manquant doit
 * faire disparaître une carte, pas planter la page — mais il n'a pas à tolérer
 * un producteur d'une autre version.
 */
export const SuggestionVilleSchema = z.object({
  code: z.string().min(1),
  nom: z.string().min(1),
  departement: z.string().default(""),
  population: compteur,
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  codePostal: z.string().default(""),
  homonyme: z.boolean().default(false),
  fiches: compteur,
  attendu: compteur,
  manque: compteur,
  passage: z.enum(["jamais", "rapide", "complete"]).default("jamais"),
});

export type SuggestionVille = z.infer<typeof SuggestionVilleSchema>;

const MetierSchema = z.object({
  tag: z.string().min(1),
  motCle: z.string().min(1),
});

export const SuggestionsSchema = z.object({
  metier: MetierSchema,
  metiers: z.array(MetierSchema).default([]),
  /** Une ville illisible s'efface ; les autres restent à l'écran. */
  villes: z.preprocess((v) => {
    if (!Array.isArray(v)) return [];
    return v.filter((ville) => SuggestionVilleSchema.safeParse(ville).success);
  }, z.array(SuggestionVilleSchema)),
  /** Villes classées au total, `villes` pouvant en être un préfixe. */
  total: compteur,
  etalon: z
    .object({
      densite: z.number().nullable().default(null),
      villesCouvertes: compteur,
      fiches: compteur,
    })
    .default({ densite: null, villesCouvertes: 0, fiches: 0 }),
  tronque: z.boolean().default(false),
});

export type Suggestions = z.infer<typeof SuggestionsSchema>;
