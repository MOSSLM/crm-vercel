import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { agentSequenceEnrollSchema } from "@/app/api/_lib/schemas";
import { enrollInSequence, processSequenceEnrollment } from "@/lib/automations/engine";
import type { Automation, SequenceEnrollment } from "@/components/automations/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Agent: launch an admin-assigned sequence on one of his own prospects.
// The enrollment records created_by so the engine assigns the manual steps
// (WhatsApp / LinkedIn / call) back to this agent.
export const POST = withAuth(
  { role: "freelance", body: agentSequenceEnrollSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();

    // 1. The sequence must be assigned to this agent by the admin.
    const { data: assignment } = await sc
      .from("sequence_agent_assignments")
      .select("id")
      .eq("automation_id", body.automation_id)
      .eq("agent_id", user.id)
      .maybeSingle();
    if (!assignment) return jsonError("sequence_non_assignee", 403, {}, cors);

    // 2. The sequence must exist and be live.
    const { data: autoRow } = await sc
      .from("automations")
      .select("*")
      .eq("id", body.automation_id)
      .maybeSingle();
    const automation = autoRow as Automation | null;
    if (!automation || automation.kind !== "sequence") {
      return jsonError("sequence_introuvable", 404, {}, cors);
    }
    if (automation.status !== "on") return jsonError("sequence_inactive", 409, {}, cors);

    // 3. The company must belong to this agent.
    const { data: ent } = await sc
      .from("entreprises")
      .select("id, owner_id")
      .eq("id", body.entreprise_id)
      .maybeSingle();
    if (!ent || ent.owner_id !== user.id) return jsonError("prospect_non_attribue", 403, {}, cors);

    // 4. The contact must belong to that company.
    const { data: contact } = await sc
      .from("contacts")
      .select("id, entreprise_id")
      .eq("id", body.contact_id)
      .maybeSingle();
    if (!contact || contact.entreprise_id !== body.entreprise_id) {
      return jsonError("contact_invalide", 400, {}, cors);
    }

    // 5. Optional: attach the agent's opportunity on this company.
    const { data: opp } = await sc
      .from("opportunites")
      .select("id")
      .eq("entreprise_id", body.entreprise_id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { enrolled, enrollmentId } = await enrollInSequence(
      automation,
      {
        contact_id: body.contact_id,
        entreprise_id: body.entreprise_id,
        opportunite_id: opp?.id ?? null,
        event: "agent_enroll",
      },
      { createdBy: user.id },
    );
    if (!enrolled) return jsonError("deja_inscrit", 409, {}, cors);

    // Process the first step right away so a day-0 manual task shows up
    // without waiting for the next cron tick.
    if (enrollmentId) {
      const { data: enr } = await sc
        .from("sequence_enrollments")
        .select("*")
        .eq("id", enrollmentId)
        .maybeSingle();
      if (enr) {
        try {
          await processSequenceEnrollment(enr as SequenceEnrollment);
        } catch {
          // the cron ticker will pick it up
        }
      }
    }

    return json({ ok: true, enrollment_id: enrollmentId }, { headers: cors });
  },
);
