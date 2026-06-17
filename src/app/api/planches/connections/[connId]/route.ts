import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { connId: string };

export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("planche_connections")
    .delete()
    .eq("id", params.connId);
  if (error) return jsonError(error.message, 500);
  return json({ ok: true });
});
