import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  MEDIA_AUTOTAG_OPTIONS,
  DEFAULT_AUTOTAG_PROVIDER,
  DEFAULT_AUTOTAG_MODEL,
  isValidAutotagProvider,
} from "@/lib/ai/media-autotag-options";

export const OPTIONS = (req: Request) => preflight(req);

// Configuration globale du modèle IA vision d'auto-tag des images.
// Table `media_autotag_settings` : une seule ligne id='default'.
export const GET = withAuth({}, async ({ cors }) => {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("media_autotag_settings")
    .select("provider, model")
    .eq("id", "default")
    .maybeSingle();

  if (error) return jsonError(error.message, 500, {}, cors);

  const current = {
    provider: data?.provider ?? DEFAULT_AUTOTAG_PROVIDER,
    model: data?.model ?? DEFAULT_AUTOTAG_MODEL,
  };
  return json({ current, options: MEDIA_AUTOTAG_OPTIONS }, { headers: cors });
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
  if (!isValidAutotagProvider(provider)) return jsonError("invalid_provider", 400, {}, cors);
  const model = typeof modelRaw === "string" ? modelRaw.trim() : "";
  if (!model) return jsonError("model_required", 400, {}, cors);

  const { error } = await getServiceClient()
    .from("media_autotag_settings")
    .upsert(
      { id: "default", provider, model, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true, provider, model }, { status: 200, headers: cors });
});
