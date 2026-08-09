import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { buildDemoCard } from "@/lib/og/build-demo-card";

/**
 * POST /api/og/demo/{siteId}/prepare — fabriquer la carte au bon moment.
 *
 * LE BON MOMENT, c'est l'ouverture du dialogue « Partager » : l'opérateur
 * regarde son écran, l'attente lui est utile puisqu'elle lui montre ce que le
 * prospect va voir, et l'image est sur le CDN avant même qu'il ouvre WhatsApp.
 *
 * Le mauvais moment serait `publishSite()` : une capture prend plusieurs
 * secondes et la publication est appelée en boucle par `deploy-batch` — un
 * déploiement de 50 sites partirait en timeout. La publication se contente donc
 * d'invalider les colonnes, et c'est ici qu'on refabrique.
 *
 * Authentifié, contrairement au GET : celui-ci consomme des captures et écrit
 * en base.
 *
 * `?force=1` refait tout, capture comprise — pour l'opérateur qui vient de
 * corriger le site et veut voir la nouvelle vignette.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { siteId } = await ctx.params;
  const force = new URL(req.url).searchParams.get("force") === "1";

  const result = await buildDemoCard(getServiceClient(), siteId, { force });
  if (!result.ok) return jsonError(result.error, result.status);

  // `warnings` remonte tel quel : le dialogue affiche « capture indisponible »
  // à l'opérateur plutôt que de lui laisser croire que la carte est complète.
  return json({
    ok: true,
    url: result.url,
    regenerated: result.regenerated,
    warnings: result.warnings,
  });
}
