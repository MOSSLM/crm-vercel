import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { cardId: string };

/** Update a single card (content / style / geometry). */
export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }

  const allowed = [
    "position_x",
    "position_y",
    "width",
    "height",
    "z_index",
    "rotation",
    "content",
    "style",
    "parent_card_id",
    "sort_order",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) if (body[key] !== undefined) patch[key] = body[key];
  if (Object.keys(patch).length === 0) return jsonError("nothing_to_update", 400);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("planche_cards")
    .update(patch)
    .eq("id", params.cardId)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return json({ card: data });
});

/** Delete a card. A board card also removes its linked nested board. */
export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data: card } = await supabase
    .from("planche_cards")
    .select("type, content")
    .eq("id", params.cardId)
    .single();

  const { error } = await supabase.from("planche_cards").delete().eq("id", params.cardId);
  if (error) return jsonError(error.message, 500);

  const linkedBoardId = (card?.content as { linked_board_id?: string } | null)?.linked_board_id;
  if (card?.type === "board" && linkedBoardId) {
    await supabase.from("planches").delete().eq("id", linkedBoardId);
  }

  return json({ ok: true });
});
