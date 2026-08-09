import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { archiveSchema, type ArchivePayload } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { logPipelineStep } from "@/app/api/agent/marketing-pipeline/_lib";
import { archiveFailure } from "@/lib/archive/http";
import { archiveTargets, unarchiveTargets } from "@/lib/archive/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/agent/archive
 *
 * Archivage motivé côté agent. Même service que la route admin, mais la
 * propriété est revérifiée ici et non côté client : un agent ne peut archiver
 * que les entreprises qui lui sont attribuées, et que les opportunités portées
 * par ces entreprises.
 *
 * On résout d'abord les entreprises concernées (celles visées directement, plus
 * celles des opportunités visées), on ne garde que les siennes, puis on
 * n'archive que ce périmètre — plutôt que de refuser tout le lot dès qu'une
 * cible échappe à l'agent.
 */
export const POST = withAuth<ArchivePayload>(
  { role: "freelance", capability: "marketing_pipeline", body: archiveSchema },
  async ({ body, user, cors }) => {
    const sb = getServiceClient();

    // Les entreprises des opportunités visées : c'est `entreprises.owner_id`
    // qui fait foi, y compris quand l'agent ne cible qu'une opportunité.
    let oppEntreprises: { id: string; entreprise_id: number }[] = [];
    if (body.opportunity_ids.length > 0) {
      const { data, error } = await sb
        .from("opportunites")
        .select("id, entreprise_id")
        .in("id", body.opportunity_ids);
      if (error) return archiveFailure(error, cors);
      oppEntreprises = (data ?? []).map((o) => ({
        id: String(o.id),
        entreprise_id: Number(o.entreprise_id),
      }));
    }

    const candidates = [
      ...body.entreprise_ids,
      ...oppEntreprises.map((o) => o.entreprise_id),
    ].filter(Number.isFinite);

    if (candidates.length === 0) return jsonError("entreprise_introuvable", 404, {}, cors);

    const { data: owned, error: ownErr } = await sb
      .from("entreprises")
      .select("id")
      .in("id", [...new Set(candidates)])
      .eq("owner_id", user.id);
    if (ownErr) return archiveFailure(ownErr, cors);

    const ownedIds = new Set((owned ?? []).map((e) => Number(e.id)));
    const entrepriseIds = body.entreprise_ids.filter((id) => ownedIds.has(id));
    const opportunityIds = oppEntreprises
      .filter((o) => ownedIds.has(o.entreprise_id))
      .map((o) => o.id);

    if (entrepriseIds.length + opportunityIds.length === 0) {
      return jsonError("entreprise_non_attribuee", 403, {}, cors);
    }

    try {
      const result =
        body.action === "archive"
          ? await archiveTargets(sb, {
              opportunityIds,
              entrepriseIds,
              reason: body.reason,
              note: body.note,
              concurrentUrl: body.concurrent_url,
              actorId: user.id,
            })
          : await unarchiveTargets(sb, { opportunityIds, entrepriseIds });

      const journalisees = new Set([
        ...entrepriseIds,
        ...oppEntreprises.filter((o) => ownedIds.has(o.entreprise_id)).map((o) => o.entreprise_id),
      ]);
      await Promise.all(
        [...journalisees].map((entrepriseId) =>
          logPipelineStep({
            agentId: user.id,
            entrepriseId,
            action: body.action === "archive" ? "archive" : "unarchive",
            metadata:
              body.action === "archive"
                ? { reason: body.reason, concurrent: result.concurrent?.domaine ?? null }
                : {},
          }),
        ),
      );

      return json({ ok: true, ...result }, { headers: cors });
    } catch (e) {
      return archiveFailure(e, cors);
    }
  },
);
