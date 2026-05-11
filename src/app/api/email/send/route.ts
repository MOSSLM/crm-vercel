import { Resend } from "resend";
import { requireUser } from "@/app/api/_lib/auth";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { parseJson, sendEmailSchema, type SendEmailPayload } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";

export const OPTIONS = (req: Request) => preflight(req);

export async function POST(req: Request) {
  const cors = corsHeadersFor(req);

  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return jsonError("RESEND_API_KEY non configuré", 503, {}, cors);
  }

  const parsed = await parseJson<SendEmailPayload>(req, sendEmailSchema, cors);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const resend = new Resend(apiKey);

  let resendId: string | undefined;
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | undefined;

  // Optionally fetch and attach the audit PDF (base64 content for Resend)
  const attachments: { filename: string; content: string }[] = [];
  if (payload.audit_pdf_url) {
    try {
      const pdfRes = await fetch(payload.audit_pdf_url);
      if (pdfRes.ok) {
        const arrayBuf = await pdfRes.arrayBuffer();
        // Convert to base64 without Buffer (web-compatible)
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        attachments.push({ filename: "audit.pdf", content: btoa(binary) });
      }
    } catch (e) {
      console.warn("[email/send] could not fetch audit PDF:", e);
    }
  }

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: payload.to_name ? `${payload.to_name} <${payload.to_email}>` : payload.to_email,
      subject: payload.subject,
      html: payload.body_html,
      text: payload.body_text ?? undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
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
    await getServiceClient().from("email_logs").insert({
      resend_id: resendId ?? null,
      contact_id: payload.contact_id ?? null,
      entreprise_id: payload.entreprise_id ?? null,
      opportunite_id: payload.opportunite_id ?? null,
      lead_magnet_project_id: payload.lead_magnet_project_id ?? null,
      to_email: payload.to_email,
      to_name: payload.to_name ?? null,
      from_email: fromEmail,
      subject: payload.subject,
      body_html: payload.body_html,
      body_text: payload.body_text ?? null,
      type: payload.type ?? null,
      status,
      error_message: errorMessage ?? null,
    });
  } catch (logErr) {
    console.error("[email/send] log error:", logErr);
  }

  if (status === "failed") {
    return jsonError(errorMessage ?? "Échec envoi", 502, {}, cors);
  }

  return json({ success: true, resend_id: resendId }, { headers: cors });
}
