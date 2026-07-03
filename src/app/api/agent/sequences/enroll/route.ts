import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { agentSequenceEnrollSchema } from "@/app/api/_lib/schemas";
import { enrollInSequence, processSequenceEnrollment } from "@/lib/automations/engine";
import type { Automation, SequenceEnrollment } from "@/components/automations/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type ItemResult = {
  entreprise_id: number;
  status: "enrolled" | "deja_inscrit" | "prospect_non_attribue" | "contact_invalide" | "erreur";
};

// Agent: launch an admin-assigned sequence on a batch of his own prospects.
// Each enrollment records created_by so the engine assigns the manual steps
// (WhatsApp / LinkedIn / call) back to this agent.
export const POST = withAuth(
  { role: "freelance", body: agentSequenceEnrollSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();

    // The sequence must be assigned to this agent by the admin, and be live.
    const { data: assignment } = await sc
      .from("sequence_agent_assignments")
      .select("id")
      .eq("automation_id", body.automation_id)
      .eq("agent_id", user.id)
      .maybeSingle();
    if (!assignment) return jsonError("sequence_non_assignee", 403, {}, cors);

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

    // Batch-load ownership + contact validity + the agent's opportunities.
    const entIds = [...new Set(body.items.map((i) => i.entreprise_id))];
    const contactIds = [...new Set(body.items.map((i) => i.contact_id))];
    const [entsRes, contactsRes, oppsRes] = await Promise.all([
      sc.from("entreprises").select("id").in("id", entIds).eq("owner_id", user.id),
      sc.from("contacts").select("id, entreprise_id").in("id", contactIds),
      sc
        .from("opportunites")
        .select("id, entreprise_id, created_at")
        .in("entreprise_id", entIds)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    const ownedIds = new Set((entsRes.data ?? []).map((e) => e.id as number));
    const contactEntById = new Map(
      (contactsRes.data ?? []).map((c) => [c.id as string, c.entreprise_id as number]),
    );
    const oppByEnt = new Map<number, string>();
    for (const o of oppsRes.data ?? []) {
      if (!oppByEnt.has(o.entreprise_id as number)) oppByEnt.set(o.entreprise_id as number, o.id as string);
    }

    const results: ItemResult[] = [];
    for (const item of body.items) {
      if (!ownedIds.has(item.entreprise_id)) {
        results.push({ entreprise_id: item.entreprise_id, status: "prospect_non_attribue" });
        continue;
      }
      if (contactEntById.get(item.contact_id) !== item.entreprise_id) {
        results.push({ entreprise_id: item.entreprise_id, status: "contact_invalide" });
        continue;
      }
      try {
        const { enrolled, enrollmentId } = await enrollInSequence(
          automation,
          {
            contact_id: item.contact_id,
            entreprise_id: item.entreprise_id,
            opportunite_id: oppByEnt.get(item.entreprise_id) ?? null,
            event: "agent_enroll",
          },
          { createdBy: user.id },
        );
        if (!enrolled) {
          results.push({ entreprise_id: item.entreprise_id, status: "deja_inscrit" });
          continue;
        }
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
        results.push({ entreprise_id: item.entreprise_id, status: "enrolled" });
      } catch {
        results.push({ entreprise_id: item.entreprise_id, status: "erreur" });
      }
    }

    const enrolledCount = results.filter((r) => r.status === "enrolled").length;
    return json({ ok: true, enrolled: enrolledCount, results }, { headers: cors });
  },
);
