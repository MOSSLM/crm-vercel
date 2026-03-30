import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/env";

export const runtime = "nodejs";

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
  { params }: { params: { pageName: string } }
) {
  const { pageName } = params;
  const normalizedPageName = decodeURIComponent(pageName).trim();

  if (!normalizedPageName) {
    return response({ error: "Missing pageName." }, 400);
  }

  const { data, error } = await supabase
    .from("lead_magnets")
    .select("*")
    .ilike("page_name", normalizedPageName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return response({ error: error.message }, 500);
  }

  if (!data) {
    return response({ error: "Lead magnet page not found." }, 404);
  }

  return response(data, 200);
}
