import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/env";

export const runtime = "nodejs";

const PUBLIC_COLUMNS = [
  "id",
  "page_name",
  "slogan",
  "sub_slogan_text",
  "presentation_paragraph",
  "differentiator_1",
  "differentiator_2",
  "differentiator_3",
  "key_stat_1",
  "key_stat_2",
  "key_stat_3",
  "cta_long_title",
  "entreprise_name",
  "adresse",
  "telephone",
  "email",
  "facebook_url",
  "instagram_url",
  "linkedin_url",
  "avis_1_nom",
  "avis_1_texte",
  "avis_2_nom",
  "avis_2_texte",
  "avis_3_nom",
  "avis_3_texte",
  "avis_4_nom",
  "avis_4_texte",
] as const;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      ...corsHeaders,
    },
  });

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id: rawId } = params;
  const id = decodeURIComponent(rawId).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  if (!id || !isUuid) {
    return response({ error: "Invalid id format. Expected UUID." }, 400);
  }

  const { data, error } = await supabase
    .from("lead_magnets")
    .select(PUBLIC_COLUMNS.join(","))
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return response({ error: error.message }, 500);
  }

  if (!data) {
    return response({ error: "Lead magnet not found." }, 404);
  }

  return response(data, 200);
}
