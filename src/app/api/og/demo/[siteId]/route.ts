import { getServiceClient } from "@/app/api/_lib/service-client";
import { buildDemoCard } from "@/lib/og/build-demo-card";

/**
 * GET /api/og/demo/{siteId} — la carte de partage, servie en octets.
 *
 * POURQUOI UNE ROUTE API ET PAS `opengraph-image.tsx`. La convention de fichier
 * de Next produirait `/site/{subdomain}/opengraph-image`, or le middleware
 * réécrit les chemins de ces hôtes vers `/site/{subdomain}` + chemin. `/api` en
 * est explicitement exclu, d'où ce chemin-ci.
 *
 * POURQUOI ON SERT LES OCTETS PLUTÔT QU'UNE REDIRECTION. La première version
 * répondait 302 vers le CDN Supabase — plus économique, mais un pari : tous les
 * robots d'unfurl ne suivent pas les redirections pour une image, et celui qui
 * ne la suit pas repart sans vignette, sans rien signaler. Servir les octets
 * depuis l'hôte du site supprime ce pari et met la carte sur le MÊME domaine
 * que la page qui la déclare.
 *
 * Le surcoût est encaissé une fois : la réponse porte un cache immuable, donc
 * le CDN de la plateforme la ressert sans réinvoquer la fonction. L'URL porte
 * un suffixe `?v=<hash>` qui change avec l'image — c'est lui qui évite qu'un
 * cache serve indéfiniment une version périmée.
 *
 * Aucune authentification : la carte est, par construction, ce qu'on montre à
 * qui reçoit le lien. Elle ne contient que ce que le site public affiche déjà.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Un an, immuable : le contenu d'une URL versionnée ne change jamais. */
const CACHE_IMMUABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await ctx.params;

  const result = await buildDemoCard(getServiceClient(), siteId);
  if (!result.ok) {
    return new Response(result.error, { status: result.status });
  }

  // L'image vit dans le stockage : on la relit et on la retransmet. Un échec de
  // relecture après une fabrication réussie est assez improbable pour ne pas
  // mériter de repli, mais assez possible pour ne pas mériter un crash.
  let amont: Response;
  try {
    amont = await fetch(result.url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    return new Response("Carte momentanément indisponible.", { status: 503 });
  }
  if (!amont.ok || !amont.body) {
    return new Response("Carte momentanément indisponible.", { status: 503 });
  }

  return new Response(amont.body, {
    status: 200,
    headers: {
      "Content-Type": amont.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": CACHE_IMMUABLE,
      // Certains robots réclament la taille avant de télécharger.
      ...(amont.headers.get("content-length")
        ? { "Content-Length": amont.headers.get("content-length") as string }
        : {}),
    },
  });
}
