import { z } from "zod";
import { jsonError } from "./respond";

/**
 * Centralized Zod schemas for /api/* request bodies and query strings.
 *
 * Each route imports the schema it needs and runs `parseJson` / `parseQuery`
 * at the top of its handler. Validation failures return a typed 400 with
 * Zod's flattened issues so the client can surface field-level errors.
 */

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

export const emailLogsQuerySchema = z.object({
  contact_id: z.string().uuid().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  opportunite_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type EmailLogsQuery = z.infer<typeof emailLogsQuerySchema>;

export const enrichLeadMagnetSchema = z.object({
  project_id: z.string().uuid(),
});
export type EnrichLeadMagnetPayload = z.infer<typeof enrichLeadMagnetSchema>;

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
