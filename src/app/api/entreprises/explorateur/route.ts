import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { z } from "zod";
import { nettoyer, schemaFiltres } from "./_filtres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Le budget est DÉCLARÉ, pas hérité du défaut de la plateforme.
 *
 * Sans cette ligne, la route prenait le défaut Vercel et se faisait couper bien
 * avant la réponse le jour où `explorateur_entreprises` a basculé de 2 s à plus
 * de trois minutes (cf. sql/20260828_explorateur_sans_cte_de_filtres.sql) : le
 * 504 arrivait sans rien dire de la cause, et on cherchait le bug dans l'écran.
 *
 * 60 s est très au-dessus du besoin — le pire cas, sans aucun filtre, tient en
 * un demi-millier de millisecondes. C'est un plafond de panne, pas une cible :
 * s'il est atteint, c'est le plan SQL qu'il faut rouvrir, pas ce nombre.
 */
export const maxDuration = 60;
export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/entreprises/explorateur
 *
 * Enveloppe de `explorateur_entreprises` : la fonction SQL rend le total, les
 * répartitions et la page en une passe. La route ne fait que valider les
 * entrées — le SQL reste seul juge de ce qu'un palier signifie.
 *
 * POST et pas GET parce que le jeu de filtres est un objet à vingt-cinq clés
 * dont neuf tableaux : le passer en querystring donnerait des URL illisibles et
 * plafonnées, et ces filtres ne sont de toute façon pas partageables sans le
 * reste de l'état de l'écran.
 *
 * Réservé aux admins, comme `/api/entreprises/explorer` : la fonction balaie
 * les 60 000 fiches sans filtre de propriétaire.
 */

const schemaCorps = z.object({
  filtres: schemaFiltres.optional(),
  page: z.number().int().min(1).max(10000).optional(),
  taille: z.number().int().min(1).max(200).optional(),
  tri: z.enum(["nom", "ville", "avis", "note", "ca", "recent", "touche", "anciennete"]).optional(),
  sens: z.enum(["asc", "desc"]).optional(),
});

type Corps = z.infer<typeof schemaCorps>;

export const POST = withAuth<Corps>(
  { role: "admin", body: schemaCorps },
  async ({ body, cors }) => {
    const sc = getServiceClient();

    const { data, error } = await sc.rpc("explorateur_entreprises", {
      p_filtres: nettoyer(body.filtres as Record<string, unknown> | undefined),
      p_page: body.page ?? 1,
      p_taille: body.taille ?? 25,
      p_tri: body.tri ?? "nom",
      p_sens: body.sens ?? "asc",
    });

    if (error) {
      // La fonction n'est pas déployée sur cet environnement : on le dit, plutôt
      // qu'une 500 nue qui enverrait chercher le bug dans l'écran.
      if (error.code === "PGRST202" || error.code === "42883") {
        return jsonError(
          "La fonction explorateur_entreprises n'est pas déployée sur cet environnement (voir sql/20260828_explorateur_sans_cte_de_filtres.sql)",
          503,
          {},
          cors,
        );
      }
      return jsonError(error.message, 500, {}, cors);
    }

    return json(data, { headers: cors });
  },
);
