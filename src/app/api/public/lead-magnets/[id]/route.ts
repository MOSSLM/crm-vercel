import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

type SupabaseInitResult =
  | { ok: true; client: SupabaseClient }
  | { ok: false; reason: "missing_config"; errorMessage: string };

let supabaseInitPromise: Promise<SupabaseInitResult> | null = null;

async function getServerSupabaseClient(): Promise<SupabaseInitResult> {
  if (!supabaseInitPromise) {
    supabaseInitPromise = (async () => {
      try {
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import("@/env");
        return {
          ok: true,
          client: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown env initialization error";
        return {
          ok: false,
          reason: "missing_config",
          errorMessage,
        };
      }
    })();
  }

  return supabaseInitPromise;
}

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

  const supabaseResult = await getServerSupabaseClient();
  if (!supabaseResult.ok) {
    console.error("[public lead magnet] diagnostics", {
      category: "config_missing",
      hasClient: false,
      message: supabaseResult.errorMessage,
    });
    return response({ error: "Server configuration error." }, 500);
  }

  const { data, error } = await supabaseResult.client
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
