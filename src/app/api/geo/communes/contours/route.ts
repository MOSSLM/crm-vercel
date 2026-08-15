import { z } from "zod";
import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { alleger } from "@/lib/carte/geo";

export const runtime = "nodejs";

/**
 * Silhouettes des communes d'une zone.
 *
 * SOURCE : `geo.api.gouv.fr`, l'API officielle de l'État — gratuite, sans clé,
 * et faisant autorité sur le découpage communal. On l'appelle depuis le serveur
 * et jamais depuis le navigateur : elle n'a pas à connaître nos utilisateurs, et
 * un appel par onglet gaspillerait un service public.
 *
 * POURQUOI PAR DÉPARTEMENT PUIS FILTRE
 * L'API rend un département entier en une requête (195 communes pour la
 * Haute-Vienne, 341 ms) mais 2,8 Mo de contours au mètre près. Les demander
 * commune par commune ferait vingt requêtes ; les servir tels quels ferait
 * vingt fois le poids utile. On prend donc le département d'un coup, on garde
 * ce qui touche la zone, et on allège chaque contour à la précision de
 * l'affichage — l'écart reste sous le pixel.
 */

const DEPARTEMENTS_EN_CACHE = new Map<string, CommuneApi[]>();

type CommuneApi = {
  code: string;
  nom: string;
  population?: number;
  contour?: { type: string; coordinates: unknown };
};

const ParamsSchema = z.object({
  bbox: z.string().transform((v, ctx) => {
    const parts = v.split(",").map(Number);
    if (parts.length !== 4 || !parts.every(Number.isFinite)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bbox attend ouest,sud,est,nord" });
      return z.NEVER;
    }
    const [ouest, sud, est, nord] = parts;
    if (ouest >= est || sud >= nord) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bbox vide ou inversée" });
      return z.NEVER;
    }
    return { ouest, sud, est, nord };
  }),
  /** Garde-fou : une emprise trop large ramènerait des départements entiers. */
  limite: z.coerce.number().int().min(1).max(60).default(30),
});

/** Départements traversés par l'emprise, via les communes qui s'y trouvent. */
async function departementsDeLEmprise(bbox: {
  ouest: number;
  sud: number;
  est: number;
  nord: number;
}): Promise<string[]> {
  // L'API accepte une recherche par point ; on interroge les quatre coins et le
  // centre, ce qui couvre les emprises d'une ville sans balayer la France.
  const points = [
    [bbox.ouest, bbox.sud],
    [bbox.est, bbox.sud],
    [bbox.ouest, bbox.nord],
    [bbox.est, bbox.nord],
    [(bbox.ouest + bbox.est) / 2, (bbox.sud + bbox.nord) / 2],
  ];
  const codes = new Set<string>();
  await Promise.all(
    points.map(async ([lon, lat]) => {
      try {
        const res = await fetch(
          `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=codeDepartement&format=json`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return;
        const corps = (await res.json()) as Array<{ codeDepartement?: string }>;
        for (const c of corps) if (c.codeDepartement) codes.add(c.codeDepartement);
      } catch {
        // Un coin en mer ou hors de France ne rend rien : ce n'est pas une erreur.
      }
    }),
  );
  return [...codes];
}

async function communesDuDepartement(code: string): Promise<CommuneApi[]> {
  const enCache = DEPARTEMENTS_EN_CACHE.get(code);
  if (enCache) return enCache;
  const res = await fetch(
    `https://geo.api.gouv.fr/departements/${encodeURIComponent(code)}/communes` +
      `?fields=nom,code,population,contour&format=json`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok) throw new Error(`geo.api.gouv.fr a répondu ${res.status}`);
  const communes = (await res.json()) as CommuneApi[];
  DEPARTEMENTS_EN_CACHE.set(code, communes);
  return communes;
}

/** Une commune touche-t-elle l'emprise ? Test sur la boîte englobante du contour. */
function toucheLEmprise(
  contour: { coordinates: unknown },
  bbox: { ouest: number; sud: number; est: number; nord: number },
): boolean {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const parcourir = (n: unknown) => {
    if (!Array.isArray(n)) return;
    if (typeof n[0] === "number" && typeof n[1] === "number") {
      const [lon, lat] = n as number[];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const enfant of n) parcourir(enfant);
  };
  parcourir(contour.coordinates);
  if (!Number.isFinite(minLon)) return false;
  return minLon <= bbox.est && maxLon >= bbox.ouest && minLat <= bbox.nord && maxLat >= bbox.sud;
}

export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url);
  const params = ParamsSchema.safeParse({
    bbox: url.searchParams.get("bbox") ?? "",
    limite: url.searchParams.get("limite") ?? undefined,
  });
  if (!params.success) {
    return jsonError("parametres_invalides", 400, { details: params.error.flatten() }, cors);
  }
  const { bbox, limite } = params.data;

  try {
    const departements = await departementsDeLEmprise(bbox);
    if (departements.length === 0) return json({ contours: [] }, { headers: cors });

    const paquets = await Promise.all(departements.map(communesDuDepartement));
    // Tolérance calée sur la taille de la zone : environ un pixel d'écart sur
    // une scène de 800 px, quelle que soit l'échelle demandée.
    const tolerance = Math.max(bbox.nord - bbox.sud, bbox.est - bbox.ouest) / 800;

    const contours = paquets
      .flat()
      .filter((c): c is CommuneApi & { contour: { type: string; coordinates: unknown } } =>
        Boolean(c.contour && toucheLEmprise(c.contour, bbox)),
      )
      // Les plus peuplées d'abord : si la limite tranche, elle garde les
      // communes qu'on reconnaît plutôt que des hameaux de bord d'emprise.
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
      .slice(0, limite)
      .map((c) => ({
        code: c.code,
        nom: c.nom,
        population: c.population ?? 0,
        contour: alleger(c.contour, tolerance),
      }));

    return json(
      { contours },
      {
        headers: {
          ...cors,
          // Le découpage communal ne bouge qu'au 1ᵉʳ janvier, et rarement.
          "Cache-Control": "private, max-age=86400",
        },
      },
    );
  } catch (err) {
    // Les silhouettes sont un confort : on répond proprement plutôt que de
    // faire tomber l'écran de suivi, qui sait s'afficher sans elles.
    return jsonError(
      "contours_indisponibles",
      502,
      { message: err instanceof Error ? err.message : String(err) },
      cors,
    );
  }
});
