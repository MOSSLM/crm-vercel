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

interface PatchBody {
  alt_text?: string | null;
  description?: string | null;
  service_tags?: string[];
  image_type?: MediaImageType;
  entreprise_id?: number | null;
}

/**
 * PATCH /api/media/:id — edit metadata.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.alt_text !== undefined) patch.alt_text = body.alt_text;
  if (body.description !== undefined) patch.description = body.description;
  if (body.service_tags !== undefined) {
    if (!Array.isArray(body.service_tags)) {
      return NextResponse.json({ error: "service_tags must be array" }, { status: 400 });
    }
    patch.service_tags = Array.from(
      new Set(body.service_tags.map((t) => String(t).trim()).filter(Boolean)),
    );
  }
  if (body.image_type !== undefined) {
    if (!IMAGE_TYPES.has(body.image_type)) {
      return NextResponse.json({ error: "Invalid image_type" }, { status: 400 });
    }
    patch.image_type = body.image_type;
  }
  if (body.entreprise_id !== undefined) patch.entreprise_id = body.entreprise_id;

  if (patch.image_type === "company" && !patch.entreprise_id) {
    // Need to verify the existing row already has one, otherwise refuse.
    const supabase = getSupabaseServiceClient();
    const { data: existing } = await supabase
      .from("media_library")
      .select("entreprise_id")
      .eq("id", id)
      .single();
    if (!existing?.entreprise_id) {
      return NextResponse.json(
        { error: "entreprise_id requis pour image_type='company'" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("media_library")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * DELETE /api/media/:id — remove from storage + DB.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: asset, error: fetchError } = await supabase
    .from("media_library")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
  }

  await supabase.storage.from("media-library").remove([asset.storage_path]);

  const { error: dbError } = await supabase.from("media_library").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
