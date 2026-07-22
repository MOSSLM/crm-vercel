import { z } from "zod";
import { jsonError } from "./respond";

/**
 * Centralized Zod schemas for /api/* request bodies and query strings.
 *
 * Each route imports the schema it needs and runs `parseJson` / `parseQuery`
 * at the top of its handler. Validation failures return a typed 400 with
 * Zod's flattened issues so the client can surface field-level errors.
 */

export const stripeCheckoutSchema = z.object({
  offre_id: z.string().uuid({ message: "offre_id must be a UUID" }),
});
export type StripeCheckoutPayload = z.infer<typeof stripeCheckoutSchema>;

/** Public demo-site purchase: an anonymous visitor buys the demo they're viewing. */
export const stripeCheckoutDemoSchema = z.object({
  site_id: z.string().uuid({ message: "site_id must be a UUID" }),
});
export type StripeCheckoutDemoPayload = z.infer<typeof stripeCheckoutDemoSchema>;

export const sendEmailSchema = z.object({
  to_email: z.string().email({ message: "to_email must be a valid email" }),
  to_name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(998),
  body_html: z.string().min(1),
  body_text: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  opportunite_id: z.string().uuid().optional(),
  lead_magnet_project_id: z.string().uuid().optional(),
  audit_pdf_url: z.string().url().optional(),
  type: z.enum(["lead_magnet", "relance", "premier_contact", "autre"]).optional(),
});
export type SendEmailPayload = z.infer<typeof sendEmailSchema>;

export const createTestOpportunitySchema = z.object({
  test_address_id: z.string().uuid({ message: "test_address_id must be a UUID" }),
  pipeline_id: z.string().uuid({ message: "pipeline_id must be a UUID" }),
  stage_id: z.coerce.number().int(),
  name: z.string().min(1).max(200).optional(),
});
export type CreateTestOpportunityPayload = z.infer<typeof createTestOpportunitySchema>;

export const emailLogsQuerySchema = z.object({
  contact_id: z.string().uuid().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  opportunite_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type EmailLogsQuery = z.infer<typeof emailLogsQuerySchema>;

/**
 * Records an outreach message in email_logs. Used to log WhatsApp sends (wa.me
 * has no send API) so they appear in the contact exchange history next to emails.
 * `to_email` is repurposed to hold the phone number for whatsapp rows.
 */
export const messageLogSchema = z.object({
  channel: z.enum(["email", "whatsapp"]).default("whatsapp"),
  contact_id: z.string().optional().nullable(),
  entreprise_id: z.coerce.number().int().positive().optional().nullable(),
  opportunite_id: z.string().uuid().optional().nullable(),
  to_name: z.string().max(200).optional().nullable(),
  to_email: z.string().max(320).optional().nullable(),
  subject: z.string().max(998).optional().nullable(),
  body_text: z.string().max(8000).optional().nullable(),
});
export type MessageLogPayload = z.infer<typeof messageLogSchema>;

export const enrichLeadMagnetSchema = z.object({
  project_id: z.string().uuid(),
});
export type EnrichLeadMagnetPayload = z.infer<typeof enrichLeadMagnetSchema>;

/**
 * Telephony — click-to-call via the provider callback (bridges two legs, no
 * WebRTC). Optional CRM ids let us seed the resulting `calls` row so the record
 * links are present before the provider's webhooks arrive.
 */
export const telephonyCallbackSchema = z.object({
  to: z.string().min(3).max(32),
  from: z.string().min(2).max(32).optional(),
  contact_id: z.string().optional().nullable(),
  entreprise_id: z.coerce.number().int().positive().optional().nullable(),
  opportunite_id: z.string().uuid().optional().nullable(),
});
export type TelephonyCallbackPayload = z.infer<typeof telephonyCallbackSchema>;

/** Telephony — send an SMS (optionally linked to a record). */
export const telephonySmsSendSchema = z.object({
  to: z.string().min(3).max(32),
  text: z.string().min(1).max(1000),
  from: z.string().min(2).max(32).optional(),
  contact_id: z.string().optional().nullable(),
  entreprise_id: z.coerce.number().int().positive().optional().nullable(),
});
export type TelephonySmsSendPayload = z.infer<typeof telephonySmsSendSchema>;

/** Telephony — SMS messages/threads listing filters. */
export const telephonySmsQuerySchema = z.object({
  contact_id: z.string().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  counterpart: z.string().optional(),
  thread_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type TelephonySmsQuery = z.infer<typeof telephonySmsQuerySchema>;

/** Telephony — log a cockpit call outcome (disposition + note) on a deal. */
export const cockpitOutcomeSchema = z.object({
  opportunite_id: z.string().min(1),
  disposition: z.string().min(1).max(40),
  note: z.string().max(4000).optional().nullable(),
});
export type CockpitOutcomePayload = z.infer<typeof cockpitOutcomeSchema>;

/** Telephony — book an appointment, assignable to the agent or to admin. */
export const telephonyAppointmentSchema = z.object({
  title: z.string().min(1).max(200),
  start_at: z.string().min(10),
  duration_min: z.coerce.number().int().min(5).max(600).default(30),
  for_admin: z.boolean().optional().default(false),
  contact_id: z.string().optional().nullable(),
  entreprise_id: z.coerce.number().int().positive().optional().nullable(),
  opportunite_id: z.string().uuid().optional().nullable(),
  call_id: z.string().uuid().optional().nullable(),
});
export type TelephonyAppointmentPayload = z.infer<typeof telephonyAppointmentSchema>;

/** Telephony — call journal / history listing filters. */
export const telephonyCallsQuerySchema = z.object({
  contact_id: z.string().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  opportunite_id: z.string().uuid().optional(),
  direction: z.enum(["inbound", "outbound", "internal"]).optional(),
  agent_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TelephonyCallsQuery = z.infer<typeof telephonyCallsQuerySchema>;

/**
 * Prepares one or more opportunities for (re)enrichment on the Marketing & Web
 * pipeline: ensures each has a `lead_magnet_projects` row and resets it to a
 * re-runnable state. `overwrite` additionally clears the enrichment-derived
 * columns so the next run repopulates them from scratch.
 */
export const marketingEnrichPrepareSchema = z.object({
  opportunity_ids: z.array(z.string().uuid()).min(1).max(50),
  overwrite: z.boolean().optional().default(false),
});
export type MarketingEnrichPreparePayload = z.infer<typeof marketingEnrichPrepareSchema>;

/**
 * Moves a batch of opportunities to another CRM pipeline from the Marketing &
 * Web board (e.g. "Entreprises sans site web", "Streak mars/avril", "Général").
 */
export const marketingMovePipelineSchema = z.object({
  opportunity_ids: z.array(z.string().uuid()).min(1).max(200),
  pipeline_id: z.string().uuid(),
});
export type MarketingMovePipelinePayload = z.infer<typeof marketingMovePipelineSchema>;

const channelEnum = z.enum(["email", "sms", "whatsapp", "linkedin", "telephone", "pas_defini"]);
const directionEnum = z.enum(["entrant", "sortant"]);
const outcomeEnum = z.enum(["positif", "neutre", "negatif", "inconnu"]);

const journalCommonFields = {
  opportunite_id: z.string().min(1).optional().nullable(),
  entreprise_id: z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  channel: channelEnum.optional(),
  direction: directionEnum.optional(),
  outcome: outcomeEnum.optional(),
  details: z.string().optional().nullable(),
  skipTouchpoint: z.boolean().optional(),
};

export const journalEventSchema = z.object({
  type_evenement: z.string().min(1),
  description: z.string().optional().nullable(),
  opportunite_id: z.string().min(1).optional().nullable(),
  entreprise_id: z.number().int().positive().optional().nullable(),
});

export const journalTouchpointSchema = z.object({
  opportunite_id: z.string().min(1).optional().nullable(),
  entreprise_id: z.number().int().positive().optional().nullable(),
  step_kind: z.string().min(1),
  channel: channelEnum,
  direction: directionEnum.optional(),
  outcome: outcomeEnum.optional(),
  details: z.string().optional().nullable(),
});

export const journalLogSchema = z.object(journalCommonFields);

export const agentSequenceEnrollSchema = z.object({
  automation_id: z.string().uuid({ message: "automation_id must be a UUID" }),
  items: z
    .array(
      z.object({
        entreprise_id: z.coerce.number().int().positive(),
        contact_id: z.string().uuid({ message: "contact_id must be a UUID" }),
      }),
    )
    .min(1)
    .max(50),
});
export type AgentSequenceEnrollPayload = z.infer<typeof agentSequenceEnrollSchema>;

/**
 * Reads JSON from the request and validates it.
 *
 * Returns `{ ok: true, data }` on success; on parse or validation failure,
 * returns `{ ok: false, response }` where the response is a 400 ready to
 * return — caller merges any CORS headers via the `extraHeaders` arg.
 */
export const parseJson = async <T>(
  req: Request,
  schema: z.ZodType<T>,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError("invalid_json", 400, {}, extraHeaders) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError("invalid_body", 400, { issues: parsed.error.flatten() }, extraHeaders),
    };
  }
  return { ok: true, data: parsed.data };
};

/** Validates URLSearchParams against a schema. Records nest into objects via `Object.fromEntries`. */
export const parseQuery = <T>(
  url: URL,
  schema: z.ZodType<T>,
  extraHeaders: Record<string, string> = {},
): { ok: true; data: T } | { ok: false; response: Response } => {
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError("invalid_query", 400, { issues: parsed.error.flatten() }, extraHeaders),
    };
  }
  return { ok: true, data: parsed.data };
};
