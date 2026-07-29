import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  NOTE_SEVERITIES,
  NOTE_STATUSES,
  NOTE_SUBJECTS,
  addNoteMessage,
  createNote,
  listNotes,
  setNoteStatus,
} from "../_notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Tickets du marketing pipeline, côté admin : la file complète, tous agents
 * confondus. Le pendant agent (`/api/agent/marketing-pipeline/notes`) fait
 * exactement la même chose, restreint à ses entreprises.
 *
 * GET  ?opportunite_id=…&status=open|in_progress|resolved
 * POST { action: "create" | "reply" | "status", … }
 */
export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const result = await listNotes({
    opportuniteId: url.searchParams.get("opportunite_id") ?? undefined,
    status:
      statusParam === "open" || (NOTE_STATUSES as readonly string[]).includes(statusParam ?? "")
        ? (statusParam as "open")
        : undefined,
  });
  if (!result.ok) return jsonError(result.error, result.status, {}, cors);
  return json({ notes: result.data }, { headers: cors });
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    opportunite_id: z.string().uuid(),
    subject: z.enum(NOTE_SUBJECTS),
    severity: z.enum(NOTE_SEVERITIES).default("probleme"),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(5000).default(""),
  }),
  z.object({
    action: z.literal("reply"),
    note_id: z.string().uuid(),
    body: z.string().trim().min(1).max(5000),
  }),
  z.object({
    action: z.literal("status"),
    note_id: z.string().uuid(),
    status: z.enum(NOTE_STATUSES),
  }),
]);
type Body = z.infer<typeof bodySchema>;

export const POST = withAuth<Body>({ role: "admin", body: bodySchema }, async ({ body, user, cors }) => {
  if (body.action === "create") {
    const res = await createNote({
      opportuniteId: body.opportunite_id,
      subject: body.subject,
      severity: body.severity,
      title: body.title,
      body: body.body,
      authorId: user.id,
      authorRole: "admin",
    });
    if (!res.ok) return jsonError(res.error, res.status, {}, cors);
    return json({ ok: true, note_id: res.data.id }, { status: 201, headers: cors });
  }

  if (body.action === "reply") {
    const res = await addNoteMessage({
      noteId: body.note_id,
      body: body.body,
      authorId: user.id,
      authorRole: "admin",
    });
    if (!res.ok) return jsonError(res.error, res.status, {}, cors);
    return json({ ok: true, message_id: res.data.id }, { status: 201, headers: cors });
  }

  const res = await setNoteStatus({ noteId: body.note_id, status: body.status, actorId: user.id });
  if (!res.ok) return jsonError(res.error, res.status, {}, cors);
  return json({ ok: true, status: res.data.status }, { headers: cors });
});
