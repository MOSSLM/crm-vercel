import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  ENRICHMENT_LLM_OPTIONS,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  isValidProvider,
} from "@/lib/enrichment/llm-options";

export const OPTIONS = (req: Request) => preflight(req);

// Configuration globale du modèle IA de l'enrichissement.
// Table `enrichment_llm_settings` : une seule ligne id='default'.
export const GET = withAuth({}, async ({ cors }) => {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("enrichment_llm_settings")
    .select("provider, model")
    .eq("id", "default")
    .maybeSingle();

  if (error) return jsonError(error.message, 500, {}, cors);

  const current = {
    provider: data?.provider ?? DEFAULT_LLM_PROVIDER,
    model: data?.model ?? DEFAULT_LLM_MODEL,
  };
  return json({ current, options: ENRICHMENT_LLM_OPTIONS }, { headers: cors });
});

export const PUT = withAuth({}, async ({ req, cors }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400, {}, cors);
  }

  const provider = (body as { provider?: unknown })?.provider;
  const modelRaw = (body as { model?: unknown })?.model;
  if (!isValidProvider(provider)) return jsonError("invalid_provider", 400, {}, cors);
  const model = typeof modelRaw === "string" ? modelRaw.trim() : "";
  if (!model) return jsonError("model_required", 400, {}, cors);

  const { error } = await getServiceClient()
    .from("enrichment_llm_settings")
    .upsert(
      { id: "default", provider, model, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true, provider, model }, { status: 200, headers: cors });
});
