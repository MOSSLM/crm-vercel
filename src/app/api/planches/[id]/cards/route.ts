import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import type { PlancheCardType } from "@/types";

export const dynamic = "force-dynamic";

type Params = { id: string };

const CARD_TYPES: ReadonlySet<PlancheCardType> = new Set([
  "note",
  "text",
  "image",
  "file",
  "link",
  "todo",
  "color",
  "column",
  "board",
]);

type CreateBody = {
  type: PlancheCardType;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number | null;
  z_index?: number;
  rotation?: number;
  content?: Record<string, unknown>;
  style?: Record<string, unknown>;
  parent_card_id?: string | null;
  sort_order?: number;
};

/** Create a card. Type `board` also spins up the linked child board. */
export const POST = withAuth<undefined, Params>({}, async ({ req, params, user }) => {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }
  if (!body.type || !CARD_TYPES.has(body.type)) return jsonError("invalid_type", 400);

  const supabase = getServiceClient();
  const content: Record<string, unknown> = { ...(body.content ?? {}) };

  // A board card opens its own nested board — create it up front.
  let childBoardId: string | null = null;
  if (body.type === "board") {
    const { data: child, error: childError } = await supabase
      .from("planches")
      .insert({
        title: (content.title as string) || "Nouvelle planche",
        parent_board_id: params.id,
        owner_id: user.id,
      })
      .select("id")
      .single();
    if (childError) return jsonError(childError.message, 500);
    childBoardId = child.id;
    content.linked_board_id = child.id;
  }

  const { data: card, error } = await supabase
    .from("planche_cards")
    .insert({
      board_id: params.id,
      type: body.type,
      position_x: body.position_x ?? 0,
      position_y: body.position_y ?? 0,
      width: body.width ?? 240,
      height: body.height ?? null,
      z_index: body.z_index ?? 0,
      rotation: body.rotation ?? 0,
      content,
      style: body.style ?? {},
      parent_card_id: body.parent_card_id ?? null,
      sort_order: body.sort_order ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    if (childBoardId) await supabase.from("planches").delete().eq("id", childBoardId);
    return jsonError(error.message, 500);
  }

  // Back-link the child board to its opening card.
  if (childBoardId) {
    await supabase.from("planches").update({ parent_card_id: card.id }).eq("id", childBoardId);
  }

  return json({ card }, { status: 201 });
});

type BulkPatch = {
  cards: Array<{
    id: string;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number | null;
    z_index?: number;
    rotation?: number;
    parent_card_id?: string | null;
    sort_order?: number;
  }>;
};

/** Bulk-update geometry (used for drag / resize / reordering autosave). */
export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  let body: BulkPatch;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }
  if (!Array.isArray(body.cards)) return jsonError("invalid_body", 400);

  const supabase = getServiceClient();
  const fields = [
    "position_x",
    "position_y",
    "width",
    "height",
    "z_index",
    "rotation",
    "parent_card_id",
    "sort_order",
  ] as const;

  await Promise.all(
    body.cards.map((c) => {
      const patch: Record<string, unknown> = {};
      for (const f of fields) if (c[f] !== undefined) patch[f] = c[f];
      if (Object.keys(patch).length === 0) return Promise.resolve();
      return supabase.from("planche_cards").update(patch).eq("id", c.id).eq("board_id", params.id);
    }),
  );

  return json({ ok: true });
});
