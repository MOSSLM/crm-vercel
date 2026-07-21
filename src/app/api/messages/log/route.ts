import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { messageLogSchema, parseJson } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { advanceToFirstApproach } from "@/app/api/agent/_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Records an outreach message (currently WhatsApp) in email_logs so it shows up
 * in the contact exchange history. wa.me has no send API, so the client posts
 * here at click time with the pre-filled message. Also nudges the opportunity to
 * the "Première approche" stage when it's still a fresh lead.
 */
export const POST = withAuth({}, async ({ req, cors }) => {
  const parsed = await parseJson(req, messageLogSchema, cors);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;

  const supabase = getServiceClient();
  const subject =
    b.subject?.trim() || (b.channel === "whatsapp" ? "Message WhatsApp" : "Message");

  const { data, error } = await supabase
    .from("email_logs")
    .insert({
      channel: b.channel,
      contact_id: b.contact_id ?? null,
      entreprise_id: b.entreprise_id ?? null,
      opportunite_id: b.opportunite_id ?? null,
      to_email: b.to_email ?? "",
      to_name: b.to_name ?? null,
      subject,
      body_text: b.body_text ?? null,
      status: "sent",
    })
    .select("id")
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);

  // First email/WhatsApp touch → move the deal to "Première approche" (best effort).
  if (b.opportunite_id) {
    await advanceToFirstApproach(supabase, b.opportunite_id).catch(() => {});
  }

  return json({ id: data.id }, { headers: cors });
});
