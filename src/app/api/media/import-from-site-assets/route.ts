/**
 * Imports images uploaded through the site builder (bucket `site-builder-assets`
 * / table `site_builder_assets`) into the central media library, so photos added
 * via the builder's "Upload" tab or a Claude Design import become reusable,
 * searchable library items.
 *
 * Per requirement, imported items get an AI-generated alt text + description but
 * NO service tags (`service_tags: []`). Bytes are copied into the `media-library`
 * bucket (and re-optimised on the way), making each library item self-contained.
 *
 * Idempotent: `media_library.source_asset_id` records the origin asset, so an
 * asset already imported is skipped on the next run. The UI loops this endpoint
 * (MAX_PER_CALL at a time) until `done` is true — bounding the serverless budget.
 */
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { describeImage } from "@/lib/ai/describe-image";
import {
  DEFAULT_AUTOTAG_PROVIDER,
  DEFAULT_AUTOTAG_MODEL,
  isValidAutotagProvider,
  type AutotagProvider,
} from "@/lib/ai/media-autotag-options";
import { optimizeImageUpload } from "@/lib/images/optimize-image";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Copy + vision cost per item is high, so keep the per-call batch small. */
const MAX_PER_CALL = 12;
const SRC_BUCKET = "site-builder-assets";
const DST_BUCKET = "media-library";
/** Library type for builder-sourced images (generic, not company-scoped). */
const IMAGE_TYPE = "stock";

interface AssetRow {
  id: string;
  path: string;
  filename: string | null;
  mime_type: string | null;
}

export const POST = withAuth({}, async ({ req, cors }) => {
  let body: { describe?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body → use defaults */
  }
  // Default: generate alt + description via the vision model. Pass
  // { describe: false } to only copy the images without any AI call.
  const describe = body.describe !== false;

  const sb = getServiceClient();

  // Provider / model from settings (default = economical Haiku).
  const { data: cfg } = await sb
    .from("media_autotag_settings")
    .select("provider, model")
    .eq("id", "default")
    .maybeSingle();
  const provider: AutotagProvider = isValidAutotagProvider(cfg?.provider)
    ? cfg.provider
    : DEFAULT_AUTOTAG_PROVIDER;
  const model = typeof cfg?.model === "string" && cfg.model ? cfg.model : DEFAULT_AUTOTAG_MODEL;

  // Assets already imported (skip them) — small left-anti-join done in memory.
  const { data: importedRows, error: impErr } = await sb
    .from("media_library")
    .select("source_asset_id")
    .not("source_asset_id", "is", null);
  if (impErr) return jsonError(impErr.message, 500, {}, cors);
  const imported = new Set(
    (importedRows ?? []).map((r) => (r as { source_asset_id: string }).source_asset_id),
  );

  const { data: assetData, error: assetErr } = await sb
    .from("site_builder_assets")
    .select("id, path, filename, mime_type")
    .order("created_at", { ascending: false })
    .limit(MAX_PER_CALL * 6);
  if (assetErr) return jsonError(assetErr.message, 500, {}, cors);

  const assets = ((assetData ?? []) as AssetRow[])
    .filter((a) => !imported.has(a.id))
    .slice(0, MAX_PER_CALL);

  if (assets.length === 0) {
    return json({ processed: 0, inserted: 0, failures: [], done: true }, { headers: cors });
  }

  const failures: { id: string; error: string }[] = [];
  let inserted = 0;

  for (const asset of assets) {
    try {
      // 1) Download the original bytes from the site-builder bucket.
      const { data: blob, error: dlErr } = await sb.storage.from(SRC_BUCKET).download(asset.path);
      if (dlErr || !blob) throw new Error(dlErr?.message || "Téléchargement impossible");
      const srcBytes = Buffer.from(await blob.arrayBuffer());
      const srcMime = asset.mime_type || blob.type || "application/octet-stream";

      // 2) Optimise + re-upload into the media-library bucket (self-contained).
      const opt = await optimizeImageUpload(srcBytes, srcMime, asset.filename ?? undefined);
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${opt.ext}`;
      const storagePath = `${IMAGE_TYPE}/${unique}`;
      const { error: upErr } = await sb.storage
        .from(DST_BUCKET)
        .upload(storagePath, opt.bytes, {
          contentType: opt.contentType,
          upsert: false,
          cacheControl: "31536000, immutable",
        });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = sb.storage.from(DST_BUCKET).getPublicUrl(storagePath);

      // 3) Alt + description (NO tags). Vision failure must not block the import.
      let altText: string | null = null;
      let description: string | null = null;
      if (describe) {
        try {
          const r = await describeImage({
            imageUrl: urlData.publicUrl,
            allowedTags: [],
            provider,
            model,
            withTags: false,
          });
          altText = r.alt_text || null;
          description = r.description || null;
        } catch {
          /* keep alt/description null; the image is still imported */
        }
      }

      // 4) Insert the library row (empty tags, origin recorded for idempotency).
      const { error: insErr } = await sb.from("media_library").insert({
        file_name: asset.filename ?? unique,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        mime_type: opt.contentType,
        size_bytes: opt.bytes.length,
        width: opt.width,
        height: opt.height,
        alt_text: altText,
        description,
        service_tags: [],
        image_type: IMAGE_TYPE,
        source_asset_id: asset.id,
      });
      if (insErr) {
        // Roll back the orphaned object so a retry starts clean.
        await sb.storage.from(DST_BUCKET).remove([storagePath]);
        throw new Error(insErr.message);
      }
      inserted++;
    } catch (e) {
      failures.push({ id: asset.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // `done` tells the UI whether the sweep can stop.
  const done = assets.length < MAX_PER_CALL;
  return json({ processed: assets.length, inserted, failures, done, provider, model }, { headers: cors });
});
