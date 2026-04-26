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

  const { data } = await getServiceClient()
    .from("email_signature_settings")
    .select("*")
    .eq("user_id", result.user.id)
    .maybeSingle();

  return json(data ?? null, { headers: cors });
}

export async function PUT(req: NextRequest) {
  const cors = corsHeadersFor(req);
  const result = await requireUser(req, cors);
  if (!result.ok) return result.response;

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
    .upsert({ user_id: result.user.id, ...fields }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { status: 200, headers: cors });
}
