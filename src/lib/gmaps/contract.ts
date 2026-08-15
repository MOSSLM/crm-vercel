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
  tilesTotal: compteur,
  /** businessType -> uuid de la ligne `recherches`. */
  rechercheIds: z.preprocess(dictionnaireTolerant, z.record(z.string(), z.string())),
  error: messageErreur,
  metadata: z.preprocess(dictionnaireTolerant, z.record(z.string(), z.unknown())),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
