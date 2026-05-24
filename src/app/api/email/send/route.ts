import { Resend } from "resend";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { sendEmailSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const POST = withAuth({ body: sendEmailSchema }, async ({ body: payload, cors }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return jsonError("RESEND_API_KEY non configuré", 503, {}, cors);

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const resend = new Resend(apiKey);

  let resendId: string | undefined;
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | undefined;

  const attachments: { filename: string; content: string }[] = [];
  if (payload.audit_pdf_url) {
    try {
      const pdfRes = await fetch(payload.audit_pdf_url);
      if (pdfRes.ok) {
        const arrayBuf = await pdfRes.arrayBuffer();
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

  if (status === "failed") return jsonError(errorMessage ?? "Échec envoi", 502, {}, cors);

  return json({ success: true, resend_id: resendId }, { headers: cors });
});
