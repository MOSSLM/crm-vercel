import { preflight } from "@/app/api/_lib/cors";
import { json } from "@/app/api/_lib/respond";
import { archiveSchema, type ArchivePayload } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { archiveFailure } from "@/lib/archive/http";
import { archiveTargets, unarchiveTargets } from "@/lib/archive/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/archive   { action, opportunity_ids, entreprise_ids, reason, … }
 *
 * Archivage motivé côté admin. Le pendant agent est `/api/agent/archive`
 * (même service, plus la garde de propriété et la journalisation).
 *
 * Côté serveur et non depuis le navigateur : un `update` navigateur sur une
 * fiche du pool est refusé par la RLS sans lever d'erreur (0 ligne touchée =
 * succès silencieux) et la carte revenait au rechargement. On renvoie ici le
 * nombre réel de lignes touchées.
 */
export const POST = withAuth<ArchivePayload>(
  { role: "admin", body: archiveSchema },
  async ({ body, user, cors }) => {
    const sb = getServiceClient();

    try {
      const result =
        body.action === "archive"
          ? await archiveTargets(sb, {
              opportunityIds: body.opportunity_ids,
              entrepriseIds: body.entreprise_ids,
              reason: body.reason,
              note: body.note,
              concurrentUrl: body.concurrent_url,
              actorId: user.id,
            })
          : await unarchiveTargets(sb, {
              opportunityIds: body.opportunity_ids,
              entrepriseIds: body.entreprise_ids,
            });

      return json({ ok: true, ...result }, { headers: cors });
    } catch (e) {
      return archiveFailure(e, cors);
    }
  },
);
