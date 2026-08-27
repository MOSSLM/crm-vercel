/**
 * GET /api/equipe — ce que fait l'équipe, en un aller-retour.
 *
 * ── RÉSERVÉE À L'ADMIN, ET C'EST LE SEUL ENDROIT DU LOT QUI L'EST ────────
 * Toutes les routes `/api/agent/*` se cadrent sur `user.id` : leur porte
 * `freelance` s'ouvre désormais aussi à l'admin, parce qu'il n'y voit que ses
 * propres lignes (cf. l'en-tête de `require-role`). Celle-ci est l'inverse :
 * elle lit le travail des AUTRES. Elle exige donc `role: "admin"`, et cette
 * asymétrie est exactement la ligne de partage à tenir.
 *
 * ── AUCUN AGRÉGAT CÔTÉ NODE ──────────────────────────────────────────────
 * Tout se compte en base (`activite_des_agents()`), en une requête. Charger
 * 1 057 tâches et 545 événements pour les compter en JavaScript coûterait la
 * mémoire de la fonction et une seconde de latence, pour un écran qu'on ouvre
 * en 4G entre deux rendez-vous.
 *
 * ── ELLE NE REND AUCUN VERDICT ───────────────────────────────────────────
 * Des nombres et des dates. « Actif », « en sommeil » se décident dans
 * `src/lib/equipe/activite.ts`, où un seuil se change sans migration.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import type { LigneActivite } from "@/lib/equipe/activite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const fonctionAbsente = (e: { code?: string; message?: string } | null): boolean =>
  !!e &&
  (e.code === "PGRST202" ||
    e.code === "42883" ||
    /could not find the function|does not exist/i.test(e.message ?? ""));

export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const { data, error } = await getServiceClient().rpc("activite_des_agents");

  if (error) {
    if (fonctionAbsente(error)) {
      return jsonError(
        "sql/20260827_activite_des_agents.sql n'est pas appliquée",
        503,
        { code: "migration" },
        cors,
      );
    }
    return jsonError(error.message, 500, {}, cors);
  }

  return json({ membres: (data ?? []) as LigneActivite[] }, { headers: cors });
});
