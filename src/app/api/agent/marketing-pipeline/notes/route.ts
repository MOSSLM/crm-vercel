import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  NOTE_SEVERITIES,
  NOTE_STATUSES,
  NOTE_SUBJECTS,
  addNoteMessage,
  createNote,
  listNotes,
  setNoteStatus,
} from "@/app/api/marketing-pipeline/_notes";
import { logPipelineStep } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Tickets du marketing pipeline, côté agent.
 *
 * C'est le canal « je bloque / j'ai un doute » : l'agent signale un problème sur
 * l'enrichissement, le site démo ou l'audit au lieu de corriger à l'aveugle, et
 * l'admin le voit sur la même ligne du board. Mêmes opérations que la route
 * admin, restreintes aux entreprises qui lui sont attribuées (`ownerId`).
 *
 * GET  ?opportunite_id=…&status=open
 * POST { action: "create" | "reply" | "status", … }
 */
export const GET = withAuth(
  { role: "freelance", capability: "marketing_pipeline" },
  async ({ req, user, cors }) => {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const result = await listNotes({
      ownerId: user.id,
      opportuniteId: url.searchParams.get("opportunite_id") ?? undefined,
      status:
        statusParam === "open" || (NOTE_STATUSES as readonly string[]).includes(statusParam ?? "")
          ? (statusParam as "open")
          : undefined,
    });
    if (!result.ok) return jsonError(result.error, result.status, {}, cors);
    return json({ notes: result.data }, { headers: cors });
  },
);

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
    // L'agent peut refermer un ticket qu'il a ouvert (ou le rouvrir) ; c'est
    // l'admin qui tranche, mais un agent doit pouvoir dire « c'est réglé ».
    action: z.literal("status"),
    note_id: z.string().uuid(),
    status: z.enum(NOTE_STATUSES),
  }),
]);
type Body = z.infer<typeof bodySchema>;

export const POST = withAuth<Body>(
  { role: "freelance", capability: "marketing_pipeline", body: bodySchema },
  async ({ body, user, cors }) => {
    if (body.action === "create") {
      const res = await createNote({
        opportuniteId: body.opportunite_id,
        subject: body.subject,
        severity: body.severity,
        title: body.title,
        body: body.body,
        authorId: user.id,
        authorRole: "agent",
        ownerId: user.id,
      });
      if (!res.ok) return jsonError(res.error, res.status, {}, cors);

      const { data: opp } = await getServiceClient()
        .from("opportunites")
        .select("entreprise_id")
        .eq("id", body.opportunite_id)
        .maybeSingle();
      const entrepriseId = opp?.entreprise_id == null ? null : Number(opp.entreprise_id);
      if (entrepriseId != null) {
        await logPipelineStep({
          agentId: user.id,
          entrepriseId,
          action: "open_note",
          metadata: { note_id: res.data.id, subject: body.subject, severity: body.severity },
        });
      }
      return json({ ok: true, note_id: res.data.id }, { status: 201, headers: cors });
    }

    if (body.action === "reply") {
      const res = await addNoteMessage({
        noteId: body.note_id,
        body: body.body,
        authorId: user.id,
        authorRole: "agent",
        ownerId: user.id,
      });
      if (!res.ok) return jsonError(res.error, res.status, {}, cors);
      return json({ ok: true, message_id: res.data.id }, { status: 201, headers: cors });
    }

    const res = await setNoteStatus({
      noteId: body.note_id,
      status: body.status,
      actorId: user.id,
      ownerId: user.id,
    });
    if (!res.ok) return jsonError(res.error, res.status, {}, cors);
    return json({ ok: true, status: res.data.status }, { headers: cors });
  },
);
