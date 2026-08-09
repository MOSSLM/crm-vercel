import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { buildBoard } from "@/app/api/marketing-pipeline/_board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/agent/marketing-pipeline/board
 *
 * Même tableau d'avancement que côté admin, restreint aux entreprises
 * attribuées à l'agent (`entreprises.owner_id`). L'attribution ayant déjà eu
 * lieu en amont, la 5e étape n'a plus de sens ici : le board agent n'affiche
 * que les 4 étapes de production (voir `AGENT_STAGES` dans PipelineMatrix).
 */
export const GET = withAuth(
  { role: "freelance", capability: "marketing_pipeline" },
  async ({ req, user, cors }) => {
    const archived = new URL(req.url).searchParams.get("archived") === "1";
    const result = await buildBoard({ ownerId: user.id, archived });
    if (!result.ok) return jsonError(result.error, result.status, {}, cors);
    return json(result.data, { headers: cors });
  },
);
