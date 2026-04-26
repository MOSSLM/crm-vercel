import { NextRequest } from "next/server";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { json, jsonError } from "@/app/api/_lib/respond";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = corsHeadersFor(req);
  const result = await requireUser(req, cors);
  if (!result.ok) return result.response;

  const { id } = await params;
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
    .eq("id", id)
    .eq("user_id", result.user.id)
    .eq("is_default", false)
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  if (!data)  return jsonError("Not found or not editable", 404, {}, cors);
  return json(data, { headers: cors });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = corsHeadersFor(req);
  const result = await requireUser(req, cors);
  if (!result.ok) return result.response;

  const { id } = await params;

  const { error } = await getServiceClient()
    .from("email_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", result.user.id)
    .eq("is_default", false);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true }, { headers: cors });
}
