import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { blocageDe, parUrgence, type LigneContenu } from "@/lib/lots/contenu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Le contenu d'un lot : une ligne par entreprise, avec son étape et ce qui la
 * bloque.
 *
 * LE BLOCAGE EST CALCULÉ ICI, pas dans le navigateur, et pas en SQL. Pas en SQL
 * parce qu'il combine un fait écrit en base (`hold_reason`) et une déduction
 * (la pièce qui manque), et que la règle de priorité entre les deux mérite un
 * test plutôt qu'un `case` de trois cents caractères. Pas dans le navigateur
 * parce que le tri par urgence en dépend : trier après coup ferait clignoter le
 * tableau au premier rendu.
 *
 * PLAFOND À 500 LIGNES. Un lot peut en porter vingt mille ; personne ne lit
 * vingt mille lignes, et les renvoyer ferait une réponse de plusieurs mégaoctets
 * pour un écran qu'on ouvre pour comprendre, pas pour inventorier. Le total du
 * lot reste lisible sur l'écran des lots — c'est lui qui porte le compte.
 */

const PLAFOND = 500;

export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const chemin = new URL(req.url).pathname.split("/").filter(Boolean);
  const brut = chemin[chemin.length - 1];
  const lotId = Number(brut);
  if (!Number.isInteger(lotId) || lotId <= 0) {
    return jsonError("Identifiant de lot invalide.", 400, {}, cors);
  }

  const sc = getServiceClient();
  const { data, error } = await sc.rpc("contenu_du_lot", {
    p_lot_id: lotId,
    p_limite: PLAFOND,
    p_decalage: 0,
  });

  if (error) {
    const absente =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /could not find the function|does not exist/i.test(error.message ?? "");
    if (absente) {
      return jsonError(
        "sql/20260821_couverture_des_lots.sql n'est pas appliquée",
        503,
        { code: "migration" },
        cors,
      );
    }
    return jsonError(error.message, 500, {}, cors);
  }

  const lignes = ((data ?? []) as LigneContenu[]).map((l) => ({ ...l, blocage: blocageDe(l) }));
  return json(
    { entreprises: parUrgence(lignes), plafond: PLAFOND, tronque: lignes.length === PLAFOND },
    { headers: cors },
  );
});
