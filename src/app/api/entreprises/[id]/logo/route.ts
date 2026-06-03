import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * Update a company's logo. Writes BOTH `entreprises.logo_url` and the linked
 * `lead_magnet_projects.logo_url`, so the one-way sync trigger
 * (lead_magnet_projects → entreprises) can never overwrite the chosen logo
 * later. Used by the site builder's settings modal when the bot picked the
 * wrong logo (or none), so the corrected logo is good everywhere.
 */
export const PUT = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const parsedId = Number(params.id);
  if (!Number.isFinite(parsedId)) return jsonError("id must be a number", 400);

  const body = await req.json().catch(() => null);
  const logoUrl = body && typeof body === "object" ? (body as { logo_url?: unknown }).logo_url : undefined;
  if (typeof logoUrl !== "string") return jsonError("{ logo_url: string } required", 400);

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("entreprises")
    .update({ logo_url: logoUrl })
    .eq("id", parsedId)
    .select("logo_url")
    .single();
  if (error) return jsonError(error.message, 500);

  // Best-effort: also write the enterprise's lead-magnet project(s). A missing
  // project is fine. (This also re-syncs entreprises via the existing trigger.)
  await supabase
    .from("lead_magnet_projects")
    .update({ logo_url: logoUrl })
    .eq("entreprise_id", parsedId);

  return json({ logo_url: (data as { logo_url: string }).logo_url });
});
