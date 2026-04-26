import { NextRequest } from "next/server";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { json, jsonError } from "@/app/api/_lib/respond";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  const cors = corsHeadersFor(req);
  const result = await requireUser(req, cors);
  if (!result.ok) return result.response;

  const { data, error } = await getServiceClient()
    .from("email_templates")
    .select("*")
    .or(`is_default.eq.true,user_id.eq.${result.user.id}`)
    .order("is_default", { ascending: false })
    .order("sort_order",  { ascending: true })
    .order("created_at",  { ascending: true });

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data ?? [], { headers: cors });
}

export async function POST(req: NextRequest) {
  const cors = corsHeadersFor(req);
  const result = await requireUser(req, cors);
  if (!result.ok) return result.response;

  const body = await req.json();

  const { data, error } = await getServiceClient()
    .from("email_templates")
    .insert({
      user_id:    result.user.id,
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
}
