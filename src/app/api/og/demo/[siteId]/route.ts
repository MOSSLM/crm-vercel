import { getServiceClient } from "@/app/api/_lib/service-client";
import { buildDemoCard } from "@/lib/og/build-demo-card";

/**
 * GET /api/og/demo/{siteId} — la carte de partage, quoi qu'il arrive.
 *
 * POURQUOI UNE ROUTE API ET PAS `opengraph-image.tsx`. La convention de fichier
 * de Next produirait `/site/{subdomain}/opengraph-image`. Sur l'hôte
 * `{subdomain}.samadigitalstudio.fr`, le middleware réécrit tout chemin sans
 * point en `/site/{subdomain}` + chemin — on obtiendrait donc
 * `/site/foo/site/foo/opengraph-image`, c'est-à-dire un 404. `src/middleware.ts`
 * saute déjà `/api`, d'où ce chemin-ci, et l'URL absolue écrite à la main.
 *
 * CHEMIN NORMAL : cette route n'est jamais appelée. `buildPageMetadata` pointe
 * directement l'URL de storage, servie par le CDN Supabase, sans invocation de
 * fonction — c'est ce qui tient devant le crawler WhatsApp, qui n'exécute pas de
 * JS et abandonne vite.
 *
 * CHEMIN DE SECOURS : la carte manque encore (site publié à l'instant, envoi
 * automatique qui n'est passé par aucun dialogue). On la fabrique ici, dans
 * l'unfurl. C'est lent — plusieurs secondes — mais c'est ce qui garantit
 * qu'aucun lien ne s'affiche blanc.
 *
 * Aucune authentification : la carte est, par construction, ce qu'on montre à
 * qui reçoit le lien. Elle ne contient que ce que le site public affiche déjà.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await ctx.params;

  const result = await buildDemoCard(getServiceClient(), siteId);
  if (!result.ok) {
    return new Response(result.error, { status: result.status });
  }

  // Redirection plutôt que renvoi des octets : l'image vit sur le CDN, et une
  // 302 vers le CDN coûte quelques millisecondes là où relire puis réémettre le
  // fichier coûterait la bande passante ET le temps d'une fonction.
  return Response.redirect(result.url, 302);
}
