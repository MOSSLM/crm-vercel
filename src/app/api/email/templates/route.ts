import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({}, async ({ user, cors }) => {
  const { data, error } = await getServiceClient()
    .from("email_templates")
    .select("*")
    .or(`is_default.eq.true,user_id.eq.${user.id}`)
    .order("is_default", { ascending: false })
    .order("sort_order",  { ascending: true })
    .order("created_at",  { ascending: true });

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data ?? [], { headers: cors });
});

export const POST = withAuth({}, async ({ user, req, cors }) => {
  const body = await req.json();

  const { data, error } = await getServiceClient()
    .from("email_templates")
    .insert({
      user_id:    user.id,
      name:       String(body.name    ?? "Nouveau template"),
      type:       String(body.type    ?? "autre"),
      subject:    String(body.subject ?? ""),
      body:       String(body.body    ?? ""),
      is_default: false,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { status: 201, headers: cors });
});
