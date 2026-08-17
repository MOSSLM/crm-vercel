import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/entreprises/explorateur/referentiel
 *
 * Ce qui remplit les listes déroulantes de l'explorateur, et que les
 * répartitions ne peuvent pas donner : elles ne décrivent que la sélection
 * courante, alors qu'un menu doit proposer TOUS les départements — y compris
 * ceux que le filtre en cours vient d'exclure.
 *
 * Les villes n'y sont pas : 19 239 valeurs ne tiennent pas dans un menu. On les
 * filtre en cliquant une barre du graphe « villes », ou par la recherche libre.
 */

type Repere = { cle: string; libelle: string; n: number };
type Lot = { id: number; nom: string; taille: number; cree_le: string };

export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();

  const [departements, agents, lots] = await Promise.all([
    sc.rpc("explorateur_referentiel_departements"),
    sc
      .from("user_profiles")
      .select("id, full_name, email, role")
      .in("role", ["admin", "freelance"])
      .order("full_name", { ascending: true }),
    sc.rpc("lots_referentiel"),
  ]);

  if (departements.error) {
    if (departements.error.code === "PGRST202" || departements.error.code === "42883") {
      return jsonError(
        "La fonction explorateur_referentiel_departements n'est pas déployée (voir sql/20260817_explorateur_entreprises.sql)",
        503,
        {},
        cors,
      );
    }
    return jsonError(departements.error.message, 500, {}, cors);
  }
  if (agents.error) return jsonError(agents.error.message, 500, {}, cors);

  // Les lots sont une fonctionnalité plus récente : leur absence (migration
  // pas encore appliquée) ne doit pas éteindre tout le référentiel, juste
  // vider le menu — même logique que le badge d'audit qui se cache.
  const lotsDisponibles =
    !lots.error && Array.isArray(lots.data) ? (lots.data as Lot[]) : [];

  return json(
    {
      departements: (departements.data ?? []) as Repere[],
      agents: (agents.data ?? []).map((a) => ({
        id: a.id as string,
        nom: (a.full_name as string | null) ?? (a.email as string | null) ?? "Sans nom",
        role: a.role as string,
      })),
      lots: lotsDisponibles,
    },
    { headers: cors },
  );
});
