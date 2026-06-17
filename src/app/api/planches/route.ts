import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

/** List every top-level board (most recently touched first) with a card count. */
export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("planches")
    .select("*, planche_cards(count)")
    .is("parent_board_id", null)
    .order("updated_at", { ascending: false });

  if (error) return jsonError(error.message, 500);

  const boards = (data ?? []).map((b) => {
    const { planche_cards, ...rest } = b as Record<string, unknown> & {
      planche_cards?: { count: number }[];
    };
    return { ...rest, card_count: planche_cards?.[0]?.count ?? 0 };
  });

  return json({ boards });
});

/** Create a board. `parent_board_id` nests it under another board. */
export const POST = withAuth({}, async ({ req, user }) => {
  let body: { title?: string; parent_board_id?: string | null; parent_card_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("planches")
    .insert({
      title: body.title?.trim() || "Sans titre",
      parent_board_id: body.parent_board_id ?? null,
      parent_card_id: body.parent_card_id ?? null,
      owner_id: user.id,
    })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return json({ board: { ...data, card_count: 0 } }, { status: 201 });
});
