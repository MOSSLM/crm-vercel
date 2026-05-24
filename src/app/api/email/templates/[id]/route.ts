import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const OPTIONS = (req: Request) => preflight(req);

type Params = { id: string };

export const PUT = withAuth<undefined, Params>({}, async ({ user, req, params, cors }) => {
  const body = await req.json();

  const { data, error } = await getServiceClient()
    .from("email_templates")
    .update({
      name:       String(body.name    ?? ""),
      type:       String(body.type    ?? "autre"),
      subject:    String(body.subject ?? ""),
      body:       String(body.body    ?? ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .eq("is_default", false)
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  if (!data)  return jsonError("Not found or not editable", 404, {}, cors);
  return json(data, { headers: cors });
});

export const DELETE = withAuth<undefined, Params>({}, async ({ user, params, cors }) => {
  const { error } = await getServiceClient()
    .from("email_templates")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .eq("is_default", false);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true }, { headers: cors });
});
