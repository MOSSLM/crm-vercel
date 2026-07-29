import { revalidatePath } from "next/cache";
import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { rebuildSiteFromTemplate } from "@/lib/site-builder/rebuild-site-from-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  site_id: z.string().uuid(),
  template_id: z.string().uuid(),
});
type Body = z.infer<typeof bodySchema>;

/**
 * POST /api/marketing-pipeline/regenerate-site   { site_id, template_id }
 *
 * Refait un site de démo existant à partir du template choisi en haut du board :
 * même site (donc même URL publiée, même audit, même avancement), contenu du
 * template appliqué et données de la fiche reprises à jour.
 *
 * Remplace l'ancien « régénérer » qui créait une démo de plus — le board
 * continuait d'afficher l'ancienne, et changer de template semblait sans effet.
 */
export const POST = withAuth<Body>({ role: "admin", body: bodySchema }, async ({ body, cors }) => {
  const res = await rebuildSiteFromTemplate(getServiceClient(), body.site_id, body.template_id);
  if (!res.ok) return jsonError(res.error ?? "Régénération échouée", res.status ?? 500, {}, cors);
  // Le rendu public est mis en cache par Next : sans ça, le prospect verrait
  // encore l'ancien site derrière la même URL.
  if (res.publishedSubdomain) {
    try {
      revalidatePath(`/site/${res.publishedSubdomain}`, "layout");
    } catch {
      /* best effort */
    }
  }
  return json(
    {
      ok: true,
      site_id: body.site_id,
      template_id: body.template_id,
      template_name: res.templateName ?? null,
      template_changed: res.templateChanged ?? false,
      republished: res.republished ?? false,
    },
    { headers: cors },
  );
});
