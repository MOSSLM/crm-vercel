import { preflight } from "@/app/api/_lib/cors";
import { publicEventTypeProjection, publicPageProjection } from "@/app/api/scheduling/_lib";
import { SLUG_RE, loadPublicEventType, publicJson } from "../../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

/** Détail public d'un type d'évènement (page de réservation). */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ username: string; slug: string }> },
) {
  const { username: rawUsername, slug: rawSlug } = await ctx.params;
  const username = decodeURIComponent(rawUsername).trim().toLowerCase();
  const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
  if (!SLUG_RE.test(username) || !SLUG_RE.test(slug)) {
    return publicJson(req, { error: "invalid_params" }, 400);
  }

  const loaded = await loadPublicEventType(username, slug);
  if (!loaded) return publicJson(req, { error: "not_found" }, 404);

  return publicJson(
    req,
    {
      page: publicPageProjection(loaded.page),
      event_type: publicEventTypeProjection(loaded.eventType),
    },
    200,
    60,
  );
}
