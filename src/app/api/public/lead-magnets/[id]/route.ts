import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const respond = (req: Request, body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      ...corsHeadersFor(req, { allowAny: true }),
    },
  });

export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id).trim();
  if (!id || !UUID_RE.test(id)) {
    return respond(req, { error: "Invalid id format. Expected UUID." }, 400);
  }

  let client;
  try {
    client = getServiceClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown env initialization error";
    console.error("[public lead magnet] config error:", message);
    return respond(req, { error: "Server configuration error." }, 500);
  }

  const { data, error } = await client
    .from("vw_lead_magnet_plugin_ready")
    .select("*")
    .eq("project_id", id)
    .maybeSingle();

  if (error) return respond(req, { error: error.message }, 500);
  if (!data) return respond(req, { error: "Lead magnet project not found." }, 404);

  return respond(req, data, 200);
}
