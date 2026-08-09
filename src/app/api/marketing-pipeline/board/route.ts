import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { buildBoard } from "../_board";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketing-pipeline/board
 *
 * Board admin : toutes les entreprises, 5 étapes (l'attribution d'un agent
 * comprise). Le pendant côté agent est `/api/agent/marketing-pipeline/board`,
 * scopé à ses entreprises. Les deux partagent `buildBoard`.
 *
 * `?archived=1` bascule sur les fiches archivées, pour les relire et les
 * désarchiver.
 */
export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const archived = new URL(req.url).searchParams.get("archived") === "1";
  const result = await buildBoard({ archived });
  if (!result.ok) return jsonError(result.error, result.status, {}, cors);
  return json(result.data, { headers: cors });
});
