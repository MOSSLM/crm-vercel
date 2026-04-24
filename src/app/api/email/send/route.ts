import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase config manquant");
  return createClient(url, key);
};

export interface SendEmailPayload {
  to_email: string;
  to_name?: string;
  subject: string;
  body_html: string;
  body_text?: string;
  contact_id?: string;
  entreprise_id?: number;
  opportunite_id?: string;
  lead_magnet_project_id?: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY non configuré" },
      { status: 503 }
    );
  }

  let payload: SendEmailPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { to_email, to_name, subject, body_html, body_text, contact_id, entreprise_id, opportunite_id, lead_magnet_project_id } = payload;

  if (!to_email || !subject || !body_html) {
    return NextResponse.json(
      { error: "Champs requis manquants: to_email, subject, body_html" },
      { status: 400 }
    );
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const resend = new Resend(apiKey);

  let resendId: string | undefined;
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | undefined;

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: to_name ? `${to_name} <${to_email}>` : to_email,
      subject,
      html: body_html,
      text: body_text ?? undefined,
    });

    if (result.error) {
      status = "failed";
      errorMessage = result.error.message;
    } else {
      resendId = result.data?.id;
    }
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
  }

  // Log to Supabase regardless of outcome
  try {
    const supabase = getSupabase();
    await supabase.from("email_logs").insert({
      resend_id: resendId ?? null,
      contact_id: contact_id ?? null,
      entreprise_id: entreprise_id ?? null,
      opportunite_id: opportunite_id ?? null,
      lead_magnet_project_id: lead_magnet_project_id ?? null,
      to_email,
      to_name: to_name ?? null,
      from_email: fromEmail,
      subject,
      body_html,
      body_text: body_text ?? null,
      status,
      error_message: errorMessage ?? null,
    });
  } catch (logErr) {
    console.error("[email/send] log error:", logErr);
  }

  if (status === "failed") {
    return NextResponse.json({ error: errorMessage ?? "Échec envoi" }, { status: 502 });
  }

  return NextResponse.json({ success: true, resend_id: resendId });
}
