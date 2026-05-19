import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface BulkPatchBody {
  ids: string[];
  add_tags?: string[];
  remove_tags?: string[];
  replace_tags?: string[];
}

interface BulkDeleteBody {
  ids: string[];
}

/**
 * PATCH /api/media/bulk — add/remove/replace tags across many items.
 * Body: { ids: string[], add_tags?: string[], remove_tags?: string[], replace_tags?: string[] }
 */
export async function PATCH(req: Request) {
  let body: BulkPatchBody;
  try {
    body = (await req.json()) as BulkPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const add = (body.add_tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const remove = (body.remove_tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const replace = body.replace_tags;

  const supabase = getSupabaseServiceClient();

  if (replace !== undefined) {
    if (!Array.isArray(replace)) {
      return NextResponse.json({ error: "replace_tags must be array" }, { status: 400 });
    }
    const cleaned = Array.from(new Set(replace.map((t) => String(t).trim()).filter(Boolean)));
    const { data, error } = await supabase
      .from("media_library")
      .update({ service_tags: cleaned })
      .in("id", body.ids)
      .select("id, service_tags");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: data ?? [] });
  }

  if (add.length === 0 && remove.length === 0) {
    return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
  }

  // Fetch current tags, mutate, write back. Acceptable for typical bulk sizes.
  const { data: rows, error: fetchError } = await supabase
    .from("media_library")
    .select("id, service_tags")
    .in("id", body.ids);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const updated: { id: string; service_tags: string[] }[] = [];
  for (const row of rows ?? []) {
    const current = Array.isArray(row.service_tags) ? (row.service_tags as string[]) : [];
    const next = Array.from(
      new Set([...current.filter((t) => !remove.includes(t)), ...add]),
    );
    const { error } = await supabase
      .from("media_library")
      .update({ service_tags: next })
      .eq("id", row.id);
    if (!error) updated.push({ id: row.id, service_tags: next });
  }

  return NextResponse.json({ updated });
}

/**
 * DELETE /api/media/bulk — remove storage files + DB rows.
 * Body: { ids: string[] }
 */
export async function DELETE(req: Request) {
  let body: BulkDeleteBody;
  try {
    body = (await req.json()) as BulkDeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: rows, error: fetchError } = await supabase
    .from("media_library")
    .select("id, storage_path")
    .in("id", body.ids);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const paths = (rows ?? []).map((r) => r.storage_path).filter(Boolean) as string[];
  if (paths.length > 0) {
    await supabase.storage.from("media-library").remove(paths);
  }

  const { error: dbError } = await supabase
    .from("media_library")
    .delete()
    .in("id", body.ids);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ deleted: body.ids.length });
}
