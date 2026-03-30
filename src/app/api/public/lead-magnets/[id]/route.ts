import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

const isLikelyJwt = (key: string | undefined): key is string =>
  Boolean(key && key.split(".").length === 3);

const getCandidateKeys = (): string[] => {
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return [anonKey, serviceRoleKey].filter(isLikelyJwt);
};

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
  const { id } = params;
  const normalizedId = decodeURIComponent(id).trim();

  if (!normalizedId) {
    return response({ error: "Missing id." }, 400);
  }
  if (!supabaseUrl) {
    return response({ error: "Missing SUPABASE_URL." }, 500);
  }

  const candidateKeys = getCandidateKeys();
  if (!candidateKeys.length) {
    return response({ error: "Missing Supabase API key." }, 500);
  }

  let lastErrorMessage: string | null = null;

  for (const key of candidateKeys) {
    const supabase = createClient(supabaseUrl, key);

    const { data, error } = await supabase
      .from("lead_magnets")
      .select("*")
      .eq("id", normalizedId)
      .maybeSingle();

    if (!error) {
      if (!data) {
        return response({ error: "Lead magnet not found." }, 404);
      }
      return response(data, 200);
    }

    lastErrorMessage = error.message;

    if (!/invalid api key/i.test(error.message)) {
      break;
    }
  }

  return response({ error: lastErrorMessage ?? "Unknown Supabase error." }, 500);
}
