import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/env";
import { requireUser } from "@/app/api/_lib/auth";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { enrichLeadMagnetSchema, parseJson, type EnrichLeadMagnetPayload } from "@/app/api/_lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

export async function POST(req: Request) {
  const cors = corsHeadersFor(req);

  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson<EnrichLeadMagnetPayload>(req, enrichLeadMagnetSchema, cors);
  if (!parsed.ok) return parsed.response;
  const { project_id } = parsed.data;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-magnet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ project_id }),
    });

    const responseText = await response.text();
    let parsedBody: unknown = null;
    if (responseText.length > 0) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        parsedBody = { raw: responseText };
      }
    }

    if (!response.ok) {
      return jsonError(
        "edge_function_request_failed",
        502,
        { upstream_status: response.status, details: parsedBody },
        cors,
      );
    }

    return json(parsedBody ?? {}, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return jsonError("edge_function_unreachable", 502, { details: message }, cors);
  }
}
