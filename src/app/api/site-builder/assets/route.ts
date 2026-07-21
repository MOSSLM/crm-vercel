import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { optimizeImageUpload } from "@/lib/images/optimize-image";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async ({ req }) => {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("site");
  if (!siteId) return jsonError("site required", 400);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("site_builder_assets")
    .select("id, public_url, filename, size, mime_type, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
});

export const POST = withAuth({}, async ({ req }) => {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("site");
  if (!siteId) return jsonError("site required", 400);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("Invalid form data", 400);
  }

  const file = formData.get("file") as File | null;
  if (!file) return jsonError("No file provided", 400);

  // Optional template-relative path (e.g. "images/hero.jpg") so a Claude Design
  // import can map the original reference → public URL deterministically.
  const originalPath = (formData.get("original_path") as string | null)?.trim() || null;

  // Optimise before storing: JPEG/opaque-PNG → WebP, transparent PNG stays PNG,
  // oversized images downscaled, quality reduced. Falls back to the original
  // bytes when nothing can be gained (see optimizeImageUpload).
  const opt = await optimizeImageUpload(await file.arrayBuffer(), file.type, file.name);

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${opt.ext}`;
  const storagePath = `${siteId}/${unique}`;

  const supabase = getServiceClient();

  const { error: uploadError } = await supabase.storage
    .from("site-builder-assets")
    .upload(storagePath, opt.bytes, {
      contentType: opt.contentType,
      upsert: false,
      // Storage paths are unique per upload, so the bytes are immutable.
      cacheControl: "31536000, immutable",
    });

  if (uploadError) return jsonError(uploadError.message, 500);

  const { data: urlData } = supabase.storage
    .from("site-builder-assets")
    .getPublicUrl(storagePath);

  const { data, error: dbError } = await supabase
    .from("site_builder_assets")
    .insert({
      site_id: siteId,
      path: storagePath,
      public_url: urlData.publicUrl,
      filename: file.name,
      size: opt.bytes.length,
      mime_type: opt.contentType,
      original_path: originalPath,
    })
    .select("id, public_url, filename, size, mime_type, created_at")
    .single();

  if (dbError) return jsonError(dbError.message, 500);
  return json(data);
});
