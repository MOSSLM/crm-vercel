import { z } from "zod";
import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";

/**
 * Communes françaises à poser en repères sur une carte.
 *
 * POURQUOI UNE ROUTE ET PAS UN FICHIER STATIQUE
 * Les contours de départements sont servis depuis `public/` parce qu'ils tiennent
 * en 250 Ko et ne bougent jamais. Les communes, elles, sont 34 875 : le fichier
 * ferait plus d'un mégaoctet, et le tronquer aux plus peuplées reviendrait à
 * n'avoir AUCUN repère dès qu'on zoome sur une zone rurale — précisément là où
 * on en a le plus besoin. Une requête par emprise rend exactement ce qui est à
 * l'écran, à n'importe quel niveau de zoom, pour quelques kilo-octets.
 *
 * Le tri par population décroissante n'est pas cosmétique : c'est lui qui fait
 * que `limite` garde les villes qui comptent. Demander 40 communes sur la France
 * entière rend Paris, Marseille, Lyon… ; les mêmes 40 sur une emprise de 20 km
 * rendent les bourgs alentour.
 */

const ParamsSchema = z.object({
  /** Emprise géographique : ouest,sud,est,nord — en degrés décimaux. */
  bbox: z
    .string()
    .transform((v, ctx) => {
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
    })
    .optional(),
  /** Nombre maximal de communes rendues, les plus peuplées d'abord. */
  limite: z.coerce.number().int().min(1).max(400).default(80),
  /** Population minimale : sert à ne pas étiqueter des hameaux sur une vue large. */
  populationMin: z.coerce.number().int().min(0).default(0),
});

export type CommuneRepere = {
  code: string;
  nom: string;
  lat: number;
  lon: number;
  population: number;
};

export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url);
  const params = ParamsSchema.safeParse({
    bbox: url.searchParams.get("bbox") ?? undefined,
    limite: url.searchParams.get("limite") ?? undefined,
    populationMin: url.searchParams.get("populationMin") ?? undefined,
  });
  if (!params.success) {
    return jsonError("parametres_invalides", 400, { details: params.error.flatten() }, cors);
  }

  const { bbox, limite, populationMin } = params.data;
  let requete = getServiceClient()
    .from("communes_fr")
    .select("code_insee, nom, lat, lon, population")
    .not("lat", "is", null)
    .not("lon", "is", null)
    .order("population", { ascending: false, nullsFirst: false })
    .limit(limite);

  if (populationMin > 0) requete = requete.gte("population", populationMin);
  if (bbox) {
    requete = requete
      .gte("lat", bbox.sud)
      .lte("lat", bbox.nord)
      .gte("lon", bbox.ouest)
      .lte("lon", bbox.est);
  }

  const { data, error } = await requete;
  if (error) {
    return jsonError("communes_indisponibles", 502, { message: error.message }, cors);
  }

  const communes: CommuneRepere[] = (data ?? []).map((c) => ({
    code: String(c.code_insee),
    nom: String(c.nom),
    lat: Number(c.lat),
    lon: Number(c.lon),
    population: Number(c.population) || 0,
  }));

  return json(
    { communes },
    {
      headers: {
        ...cors,
        // Les limites communales ne bougent qu'au gré des fusions de communes :
        // une journée de cache épargne une requête par déplacement de carte.
        "Cache-Control": "private, max-age=86400",
      },
    },
  );
});
