/**
 * Helpers des routes publiques /api/public/scheduling/* — parcours invité,
 * SANS authentification : tout passe par le service-role avec des projections
 * strictes (voir ../scheduling/_lib) et une validation d'entrée systématique.
 */

import { corsHeadersFor } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { EVENT_TYPE_COLUMNS, getPageByUsername } from "@/lib/scheduling/data";
import type { EventType, SchedulingPage } from "@/lib/scheduling/types";

/** Réponse JSON publique (CORS * pour l'embed iframe/widget). */
export const publicJson = (
  req: Request,
  body: unknown,
  status = 200,
  cacheSeconds = 0,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        cacheSeconds > 0
          ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`
          : "no-store",
      ...corsHeadersFor(req, { allowAny: true }),
    },
  });

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Page active + type d'évènement actif par username/slug publics. */
export async function loadPublicEventType(
  username: string,
  slug: string,
): Promise<{ page: SchedulingPage; eventType: EventType } | null> {
  const sc = getServiceClient();
  const page = await getPageByUsername(sc, username);
  if (!page) return null;
  const { data } = await sc
    .from("scheduling_event_types")
    .select(EVENT_TYPE_COLUMNS)
    .eq("user_id", page.user_id)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return { page, eventType: data as unknown as EventType };
}
