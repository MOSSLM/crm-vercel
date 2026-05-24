import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async ({ req }) => {
  const { searchParams } = new URL(req.url);
  const entrepriseIdRaw = searchParams.get("entreprise_id");
  if (!entrepriseIdRaw) return jsonError("entreprise_id required", 400);
  const entrepriseId = Number(entrepriseIdRaw);
  if (!Number.isFinite(entrepriseId)) return jsonError("entreprise_id must be a number", 400);

  const supabase = getServiceClient();
  const [companyRes, rankedRes] = await Promise.all([
    supabase.from("entreprises").select("service_tags").eq("id", entrepriseId).maybeSingle(),
    supabase.rpc("media_library_by_company", { p_entreprise_id: entrepriseId }),
  ]);

  if (rankedRes.error) return jsonError(rankedRes.error.message, 500);

  const ranked = (rankedRes.data ?? []) as Array<
    Record<string, unknown> & { match_count: number; is_universal: boolean }
  >;
  const suggested = ranked.filter((r) => r.match_count > 0 || r.is_universal);
  const others = ranked.filter((r) => !(r.match_count > 0 || r.is_universal));

  const companyTags = Array.isArray(companyRes.data?.service_tags)
    ? (companyRes.data.service_tags as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : [];

  return json({ suggested, others, company_tags: companyTags });
});
