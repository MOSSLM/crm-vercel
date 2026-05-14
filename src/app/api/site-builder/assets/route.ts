import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/site-builder/assets?site=<siteId>
 * List uploaded assets for a site (most recent first).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("site");
  if (!siteId) return NextResponse.json({ error: "site required" }, { status: 400 });

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("site_builder_assets")
    .select("id, public_url, filename, size, mime_type, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/site-builder/assets?site=<siteId>
 * Upload a file to Supabase Storage and record it.
 * Body: FormData with field "file".
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("site");
  if (!siteId) return NextResponse.json({ error: "site required" }, { status: 400 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop() ?? "bin";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `${siteId}/${unique}`;

  const supabase = getSupabaseServiceClient();

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("site-builder-assets")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = supabase.storage
    .from("site-builder-assets")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  const { data, error: dbError } = await supabase
    .from("site_builder_assets")
    .insert({
      site_id: siteId,
      path: storagePath,
      public_url: publicUrl,
      filename: file.name,
      size: file.size,
      mime_type: file.type,
    })
    .select("id, public_url, filename, size, mime_type, created_at")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}
