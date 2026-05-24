import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

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

export const PATCH = withAuth({}, async ({ req }) => {
  let body: BulkPatchBody;
  try {
    body = (await req.json()) as BulkPatchBody;
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) return jsonError("ids required", 400);

  const add = (body.add_tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const remove = (body.remove_tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const replace = body.replace_tags;

  const supabase = getServiceClient();

  if (replace !== undefined) {
    if (!Array.isArray(replace)) return jsonError("replace_tags must be array", 400);
    const cleaned = Array.from(new Set(replace.map((t) => String(t).trim()).filter(Boolean)));
    const { data, error } = await supabase
      .from("media_library")
      .update({ service_tags: cleaned })
      .in("id", body.ids)
      .select("id, service_tags");
    if (error) return jsonError(error.message, 500);
    return json({ updated: data ?? [] });
  }

  if (add.length === 0 && remove.length === 0) return jsonError("Nothing to do", 400);

  const { data: rows, error: fetchError } = await supabase
    .from("media_library")
    .select("id, service_tags")
    .in("id", body.ids);
  if (fetchError) return jsonError(fetchError.message, 500);

  // Each row gets a different resulting tag set, so we can't collapse to one
  // UPDATE without server-side computation. Fire the N updates in parallel
  // instead of sequentially — same N round-trips but no head-of-line blocking.
  const results = await Promise.all(
    (rows ?? []).map(async (row) => {
      const current = Array.isArray(row.service_tags) ? (row.service_tags as string[]) : [];
      const next = Array.from(
        new Set([...current.filter((t) => !remove.includes(t)), ...add]),
      );
      const { error } = await supabase
        .from("media_library")
        .update({ service_tags: next })
        .eq("id", row.id);
      return error ? null : { id: row.id, service_tags: next };
    }),
  );
  const updated = results.filter((r): r is { id: string; service_tags: string[] } => r !== null);

  return json({ updated });
});

export const DELETE = withAuth({}, async ({ req }) => {
  let body: BulkDeleteBody;
  try {
    body = (await req.json()) as BulkDeleteBody;
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) return jsonError("ids required", 400);

  const supabase = getServiceClient();
  const { data: rows, error: fetchError } = await supabase
    .from("media_library")
    .select("id, storage_path")
    .in("id", body.ids);
  if (fetchError) return jsonError(fetchError.message, 500);

  const paths = (rows ?? []).map((r) => r.storage_path).filter(Boolean) as string[];
  if (paths.length > 0) {
    await supabase.storage.from("media-library").remove(paths);
  }

  const { error: dbError } = await supabase
    .from("media_library")
    .delete()
    .in("id", body.ids);
  if (dbError) return jsonError(dbError.message, 500);

  return json({ deleted: body.ids.length });
});
