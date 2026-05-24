import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({}, async ({ user, cors }) => {
  const { data } = await getServiceClient()
    .from("email_signature_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return json(data ?? null, { headers: cors });
});

export const PUT = withAuth({}, async ({ user, req, cors }) => {
  const body = await req.json();

  const fields = {
    first_name:   String(body.first_name   ?? ""),
    last_name:    String(body.last_name    ?? ""),
    job_title:    String(body.job_title    ?? ""),
    company:      String(body.company      ?? ""),
    email:        String(body.email        ?? ""),
    phone:        String(body.phone        ?? ""),
    website:      String(body.website      ?? ""),
    linkedin_url: String(body.linkedin_url ?? ""),
    accent_color: String(body.accent_color ?? "#6366f1"),
    updated_at:   new Date().toISOString(),
  };

  const { data, error } = await getServiceClient()
    .from("email_signature_settings")
    .upsert({ user_id: user.id, ...fields }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { status: 200, headers: cors });
});
