import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

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
  const id = decodeURIComponent(params.id).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  if (!id || !isUuid) {
    return response({ error: "Invalid id format. Expected UUID." }, 400);
  }

  if (!supabase) {
    console.error("[public lead magnet] missing Supabase server config", {
      hasUrl: Boolean(SUPABASE_URL),
      hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    });
    return response({ error: "Server configuration error." }, 500);
  }

  const { data, error } = await supabase
    .from("vw_lead_magnet_plugin_ready")
    .select("*")
    .eq("project_id", id)
    .maybeSingle();

  if (error) {
    return response({ error: error.message }, 500);
  }

  if (!data) {
    return response({ error: "Lead magnet project not found." }, 404);
  }

  return response(data, 200);
}
