import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  const { id: rawId } = params;
  const id = decodeURIComponent(rawId).trim();
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
    .from("lead_magnets")
    .select(PUBLIC_COLUMNS.join(","))
    .eq("id", id)
    .maybeSingle();

  if (error) {
    const normalizedError = error.message.toLowerCase();
    if (normalizedError.includes("invalid api key")) {
      console.error("[public lead magnet] diagnostics", {
        category: "invalid_api_key",
        hasClient: true,
        isInvalidApiKey: true,
      });
      return response({ error: "Server configuration error." }, 500);
    }

    console.error("[public lead magnet] diagnostics", {
      category: "supabase_error",
      hasClient: true,
      isInvalidApiKey: false,
      code: error.code ?? null,
      message: error.message,
    });
    return response({ error: "Server error." }, 500);
  }

  if (!data) {
    console.info("[public lead magnet] diagnostics", {
      category: "row_not_found",
      hasClient: true,
      id,
    });
    return response({ error: "Lead magnet not found." }, 404);
  }

  return response(data, 200);
}
