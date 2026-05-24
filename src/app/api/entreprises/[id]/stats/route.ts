import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { id: string };

interface StatItem {
  label: string;
  value: string;
  display_order?: number;
}

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const parsedId = Number(params.id);
  if (!Number.isFinite(parsedId)) return jsonError("id must be a number", 400);
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("entreprises")
    .select("stats")
    .eq("id", parsedId)
    .single();
  if (error) return jsonError(error.message, 500);
  const stats = Array.isArray(data?.stats) ? (data.stats as StatItem[]) : [];
  return json({ stats });
});

export const PUT = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const parsedId = Number(params.id);
  if (!Number.isFinite(parsedId)) return jsonError("id must be a number", 400);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray((body as { stats?: unknown }).stats)) {
    return jsonError("{ stats: StatItem[] } required", 400);
  }
  const stats = ((body as { stats: unknown[] }).stats as unknown[])
    .filter((s): s is StatItem => !!s && typeof s === "object" && typeof (s as StatItem).label === "string" && typeof (s as StatItem).value === "string")
    .map((s, i) => ({
      label: s.label,
      value: s.value,
      display_order: typeof s.display_order === "number" ? s.display_order : i,
    }));

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("entreprises")
    .update({ stats })
    .eq("id", parsedId)
    .select("stats")
    .single();
  if (error) return jsonError(error.message, 500);
  return json({ stats: data.stats as StatItem[] });
});
