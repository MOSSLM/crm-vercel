/**
 * Log a cockpit call outcome: records the disposition + note on the deal's
 * timeline (opportunite_notes, theme 'appel'). Best-effort, agent-scoped.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { cockpitOutcomeSchema, type CockpitOutcomePayload } from "@/app/api/_lib/schemas";

export const runtime = "nodejs";

export const POST = withAuth<CockpitOutcomePayload>(
  { role: "freelance", body: cockpitOutcomeSchema },
  async ({ body, cors }) => {
    const sc = getServiceClient();
    const contenu = `[${body.disposition}] ${body.note ?? ""}`.trim();
    await sc.from("opportunite_notes").insert({
      opportunite_id: body.opportunite_id,
      theme: "appel",
      contenu,
    });
    return json({ ok: true }, { headers: cors });
  },
);
