import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import type { MediaImageType } from "@/types";

export const dynamic = "force-dynamic";

const IMAGE_TYPES: ReadonlySet<MediaImageType> = new Set([
  "stock",
  "ai_generated",
  "personal",
  "company",
]);

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
]);

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

function parseImageType(raw: string | null): MediaImageType {
  if (raw && IMAGE_TYPES.has(raw as MediaImageType)) return raw as MediaImageType;
  return "stock";
}

/**
 * GET /api/media
 * Query params:
 *   ?tags=tag1,tag2     -> overlap filter on service_tags (JSONB array)
 *   ?image_type=stock   -> exact match
 *   ?entreprise_id=123  -> exact match
 *   ?search=keyword     -> ILIKE on file_name / alt_text / description
 *   ?limit=50&offset=0  -> pagination
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tags = parseTags(searchParams.get("tags"));
  const imageType = searchParams.get("image_type");
  const entrepriseIdRaw = searchParams.get("entreprise_id");
  const search = searchParams.get("search")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from("media_library")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (tags.length > 0) {
    // JSONB array overlap: ?| operator -> "any tag matches"
    query = query.filter("service_tags", "?|", `{${tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`);
  }
  if (imageType && IMAGE_TYPES.has(imageType as MediaImageType)) {
    query = query.eq("image_type", imageType);
  }
  if (entrepriseIdRaw) {
    const parsed = Number(entrepriseIdRaw);
    if (Number.isFinite(parsed)) query = query.eq("entreprise_id", parsed);
  }
  if (search) {
    const safe = search.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.or(
      `file_name.ilike.%${safe}%,alt_text.ilike.%${safe}%,description.ilike.%${safe}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [], total: count ?? 0, limit, offset });
}

/**
 * POST /api/media
 * Body: FormData
 *   files: File[]            -> one or more files
 *   alt_text: string         -> applied to all uploaded files
 *   description: string
 *   tags: string             -> comma-separated, applied to all uploaded files
 *   image_type: MediaImageType
 *   entreprise_id: number    -> required when image_type === 'company'
 */
export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const altText = (formData.get("alt_text") as string | null)?.trim() || null;
  const description = (formData.get("description") as string | null)?.trim() || null;
  const tags = parseTags(formData.get("tags") as string | null);
  const imageType = parseImageType(formData.get("image_type") as string | null);
  const entrepriseIdRaw = formData.get("entreprise_id") as string | null;
  const entrepriseId = entrepriseIdRaw ? Number(entrepriseIdRaw) : null;

  if (imageType === "company" && (!entrepriseId || !Number.isFinite(entrepriseId))) {
    return NextResponse.json(
      { error: "entreprise_id requis pour image_type='company'" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceClient();
  const inserted = [];
  const failures: { file_name: string; error: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      failures.push({ file_name: file.name, error: "Fichier > 15 Mo" });
      continue;
    }
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      failures.push({ file_name: file.name, error: `MIME ${file.type} non supporté` });
      continue;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${imageType}/${unique}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("media-library")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      failures.push({ file_name: file.name, error: uploadError.message });
      continue;
    }

    const { data: urlData } = supabase.storage.from("media-library").getPublicUrl(storagePath);

    const { data, error: dbError } = await supabase
      .from("media_library")
      .insert({
        file_name: file.name,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        mime_type: file.type || null,
        size_bytes: file.size,
        alt_text: altText,
        description,
        service_tags: tags,
        image_type: imageType,
        entreprise_id: imageType === "company" ? entrepriseId : null,
      })
      .select("*")
      .single();

    if (dbError) {
      await supabase.storage.from("media-library").remove([storagePath]);
      failures.push({ file_name: file.name, error: dbError.message });
      continue;
    }
    inserted.push(data);
  }

  return NextResponse.json({ inserted, failures }, { status: failures.length && !inserted.length ? 400 : 200 });
}
