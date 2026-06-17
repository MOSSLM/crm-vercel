import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import type { PlancheBoard } from "@/types";

export const dynamic = "force-dynamic";

type Params = { id: string };

/** Board + its cards + connections + breadcrumb (ancestor chain). */
export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data: board, error: boardError } = await supabase
    .from("planches")
    .select("*")
    .eq("id", params.id)
    .single();

  if (boardError || !board) return jsonError("not_found", 404);

  const [{ data: cards, error: cardsError }, { data: connections, error: connError }] =
    await Promise.all([
      supabase
        .from("planche_cards")
        .select("*")
        .eq("board_id", params.id)
        .order("z_index", { ascending: true }),
      supabase.from("planche_connections").select("*").eq("board_id", params.id),
    ]);

  if (cardsError) return jsonError(cardsError.message, 500);
  if (connError) return jsonError(connError.message, 500);

  // Walk up the parent chain to build a breadcrumb (capped to avoid loops).
  const breadcrumb: Pick<PlancheBoard, "id" | "title">[] = [
    { id: board.id, title: board.title },
  ];
  let cursor: string | null = board.parent_board_id;
  for (let i = 0; cursor && i < 20; i++) {
    const { data: parent }: { data: Pick<PlancheBoard, "id" | "title" | "parent_board_id"> | null } =
      await supabase
        .from("planches")
        .select("id, title, parent_board_id")
        .eq("id", cursor)
        .single();
    if (!parent) break;
    breadcrumb.unshift({ id: parent.id, title: parent.title });
    cursor = parent.parent_board_id;
  }

  return json({ board, cards: cards ?? [], connections: connections ?? [], breadcrumb });
});

/** Rename / restyle a board. */
export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  let body: { title?: string; icon?: string | null; color?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim() || "Sans titre";
  if (body.icon !== undefined) patch.icon = body.icon;
  if (body.color !== undefined) patch.color = body.color;
  if (Object.keys(patch).length === 0) return jsonError("nothing_to_update", 400);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("planches")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return json({ board: data });
});

/** Delete a board (cards, child boards and connections cascade). */
export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { error } = await supabase.from("planches").delete().eq("id", params.id);
  if (error) return jsonError(error.message, 500);
  return json({ ok: true });
});
