import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { id: string };

/** Draw an arrow between two cards on this board. */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  let body: { from_card_id?: string; to_card_id?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }
  if (!body.from_card_id || !body.to_card_id) return jsonError("invalid_body", 400);
  if (body.from_card_id === body.to_card_id) return jsonError("self_connection", 400);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("planche_connections")
    .insert({
      board_id: params.id,
      from_card_id: body.from_card_id,
      to_card_id: body.to_card_id,
      label: body.label ?? null,
    })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return json({ connection: data }, { status: 201 });
});
