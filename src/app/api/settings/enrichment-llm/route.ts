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

/** `true` quand la colonne n'existe pas encore (migration non appliquée). */
const isMissingColumn = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? ""));

// Configuration globale du modèle IA de l'enrichissement.
// Table `enrichment_llm_settings` : une seule ligne id='default'.
export const GET = withAuth({}, async ({ cors }) => {
  const sb = getServiceClient();
  // `cost_per_run_cents` vient de la migration 20260727, appliquée hors CI :
  // on retombe sur la sélection historique tant qu'elle ne l'est pas.
  let { data, error } = await sb
    .from("enrichment_llm_settings")
    .select("provider, model, cost_per_run_cents")
    .eq("id", "default")
    .maybeSingle();

  if (error && isMissingColumn(error)) {
    ({ data, error } = await sb
      .from("enrichment_llm_settings")
      .select("provider, model")
      .eq("id", "default")
      .maybeSingle());
  }

  if (error) return jsonError(error.message, 500, {}, cors);

  const current = {
    provider: data?.provider ?? DEFAULT_LLM_PROVIDER,
    model: data?.model ?? DEFAULT_LLM_MODEL,
    // Coût forfaitaire estimé d'un run, utilisé pour décompter le budget des
    // agents. 0 (ou colonne absente) = aucun décompte.
    cost_per_run_cents: Number(data?.cost_per_run_cents) || 0,
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

  const costRaw = (body as { cost_per_run_cents?: unknown })?.cost_per_run_cents;
  const costPerRunCents =
    costRaw == null ? null : Math.max(0, Math.round(Number(costRaw) || 0));

  const sb = getServiceClient();
  const base = { id: "default", provider, model, updated_at: new Date().toISOString() };

  let { error } = await sb
    .from("enrichment_llm_settings")
    .upsert(
      costPerRunCents == null ? base : { ...base, cost_per_run_cents: costPerRunCents },
      { onConflict: "id" },
    );

  // Migration 20260727 pas encore appliquée : on enregistre au moins le modèle.
  if (error && isMissingColumn(error)) {
    ({ error } = await sb
      .from("enrichment_llm_settings")
      .upsert(base, { onConflict: "id" }));
  }

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true, provider, model, cost_per_run_cents: costPerRunCents }, { status: 200, headers: cors });
});
