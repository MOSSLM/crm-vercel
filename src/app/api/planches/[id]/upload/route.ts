import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { id: string };

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const IMAGE_DEFAULT_W = 260;
const FILE_DEFAULT_W = 240;

/**
 * Upload one or more files to a board. Images become `image` cards, anything
 * else becomes a `file` card. Optional `x` / `y` form fields anchor the first
 * card; subsequent cards cascade down-right.
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("invalid_form", 400);
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return jsonError("no_files", 400);

  const baseX = Number(formData.get("x") ?? 0) || 0;
  const baseY = Number(formData.get("y") ?? 0) || 0;
  const baseZ = Number(formData.get("z") ?? 0) || 0;

  const supabase = getServiceClient();
  const created = [];
  const failures: { file_name: string; error: string }[] = [];

  let i = 0;
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      failures.push({ file_name: file.name, error: "Fichier > 50 Mo" });
      continue;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${params.id}/${unique}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("planches")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      failures.push({ file_name: file.name, error: uploadError.message });
      continue;
    }

    const { data: urlData } = supabase.storage.from("planches").getPublicUrl(storagePath);
    const isImage = (file.type || "").startsWith("image/");
    const offset = i * 28;

    const { data: card, error: dbError } = await supabase
      .from("planche_cards")
      .insert({
        board_id: params.id,
        type: isImage ? "image" : "file",
        position_x: baseX + offset,
        position_y: baseY + offset,
        width: isImage ? IMAGE_DEFAULT_W : FILE_DEFAULT_W,
        height: null,
        z_index: baseZ + i,
        content: {
          url: urlData.publicUrl,
          storage_path: storagePath,
          file_name: file.name,
          mime: file.type || null,
          size: file.size,
        },
      })
      .select("*")
      .single();

    if (dbError) {
      await supabase.storage.from("planches").remove([storagePath]);
      failures.push({ file_name: file.name, error: dbError.message });
      continue;
    }
    created.push(card);
    i++;
  }

  return json(
    { cards: created, failures },
    { status: failures.length && !created.length ? 400 : 200 },
  );
});
