import { z } from "zod";

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { requireStaff } from "@/app/api/_lib/require-staff";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { parseQuery } from "@/app/api/_lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const carteQuerySchema = z.object({
  /** Code de département (`01`…`95`, `2A`, `2B`). Absent = national. */
  dept: z
    .string()
    .trim()
    .regex(/^(?:[0-9]{2}|2[AB])$/, "dept doit être un code de département")
    .optional(),
  /**
   * `agregat` (défaut) : compteurs par département + grille de densité, 101 ko.
   * `fiches` : toutes les fiches, statut et département déjà calculés.
   */
  detail: z.enum(["agregat", "fiches"]).default("agregat"),
});

/**
 * GET /api/entreprises/carte            → agrégat national
 * GET /api/entreprises/carte?dept=69    → les fiches d'un département
 *
 * /carte faisait trois paginations complètes depuis le navigateur — 61 requêtes
 * pour `entreprises` seule — puis recomposait le statut de chaque fiche en JS et
 * résolvait son département par un test point-dans-polygone exécuté 60 000 fois
 * sur le thread principal.
 *
 * L'agrégat national pèse 101 ko : le compte par (département, statut) pour
 * l'aplat, et une grille de densité au dixième de degré (~11 km) pour le rendu
 * visuel. Les 60 000 fiches ne transitent plus ; celles d'un département se
 * chargent au clic.
 */
export const GET = withAuth({}, async ({ req, user, cors }) => {
  const staff = await requireStaff(user, cors);
  if (!staff.ok) return staff.response;

  const parsed = parseQuery(new URL(req.url), carteQuerySchema, cors);
  if (!parsed.ok) return parsed.response;

  const sc = getServiceClient();

  if (parsed.data.dept) {
    const { data, error } = await sc.rpc("entreprises_carte_departement", {
      p_dept: parsed.data.dept,
    });
    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ fiches: data ?? [] }, { headers: cors });
  }

  if (parsed.data.detail === "fiches") {
    // `entreprises_carte()` renvoie des LIGNES, pas un tableau jsonb : replier
    // 60 000 fiches en une seule valeur jsonb dépassait 60 s côté base. En
    // lignes, la même fonction met 139 ms.
    //
    // Aucun plafond ne s'applique : ce projet n'a pas de `db-max-rows`
    // configuré (vérifié — `current_setting('pgrst.db_max_rows')` est null),
    // donc la réponse n'est pas tronquée.
    const { data, error } = await sc.rpc("entreprises_carte");
    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ fiches: data ?? [] }, { headers: cors });
  }

  const { data, error } = await sc.rpc("entreprises_carte_agregat");
  if (error) return jsonError(error.message, 500, {}, cors);

  return json(data ?? { total: 0, hors_carte: 0, departements: [], densite: [] }, {
    headers: cors,
  });
});
