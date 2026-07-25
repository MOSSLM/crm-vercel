import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { EVENT_TYPE_COLUMNS, getPageByUsername } from "@/lib/scheduling/data";
import type { EventType } from "@/lib/scheduling/types";
import { publicEventTypeProjection, publicPageProjection } from "@/app/api/scheduling/_lib";
import { SLUG_RE, publicJson } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

/** Page publique d'un hôte : profil + types d'évènements actifs. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ username: string }> },
) {
  const { username: rawUsername } = await ctx.params;
  const username = decodeURIComponent(rawUsername).trim().toLowerCase();
  if (!SLUG_RE.test(username)) return publicJson(req, { error: "invalid_username" }, 400);

  const sc = getServiceClient();
  const page = await getPageByUsername(sc, username);
  if (!page) return publicJson(req, { error: "not_found" }, 404);

  const { data } = await sc
    .from("scheduling_event_types")
    .select(EVENT_TYPE_COLUMNS)
    .eq("user_id", page.user_id)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return publicJson(
    req,
    {
      page: publicPageProjection(page),
      event_types: ((data ?? []) as unknown as EventType[]).map(publicEventTypeProjection),
    },
    200,
    60,
  );
}
