import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { marketingValidateEnrichmentSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

/** `true` quand la colonne n'existe pas encore (migration non appliquée). */
const isMissingColumn = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? ""));

/**
 * POST /api/marketing-pipeline/validate-enrichment   { project_ids }
 *
 * Étape 2 du marketing pipeline côté admin : marque les données enrichies comme
 * validées par un humain, ce qui débloque la carte « Site démo ». Le pendant
 * agent est `/api/agent/marketing-pipeline/validate-enrichment` (même écriture,
 * plus la garde de propriété et la journalisation de l'action).
 *
 * Côté serveur et non depuis le navigateur : le board se charge via le service
 * client, donc une ligne peut être affichée alors que l'UPDATE navigateur est
 * refusé par la RLS — un refus qui ne remonte pas forcément en erreur (0 ligne
 * touchée = succès silencieux), et la carte suivante ne s'ouvrait jamais. Ici on
 * renvoie le nombre réel de lignes validées.
 */
export const POST = withAuth(
  { role: "admin", body: marketingValidateEnrichmentSchema },
  async ({ body, cors }) => {
    const supabase = getServiceClient();
    const now = new Date().toISOString();

    // `enrichment_validated` vient d'une migration postérieure : on retombe sur
    // `pret_pour_lm` quand elle n'est pas appliquée, comme le fait le board.
    let res = await supabase
      .from("lead_magnet_projects")
      .update({ enrichment_validated: true, updated_at: now })
      .in("id", body.project_ids)
      .select("id");

    if (isMissingColumn(res.error)) {
      res = await supabase
        .from("lead_magnet_projects")
        .update({ pret_pour_lm: true, updated_at: now })
        .in("id", body.project_ids)
        .select("id");
    }
    if (res.error) return jsonError(res.error.message, 500, {}, cors);

    const validated = (res.data ?? []).length;
    if (validated === 0) return jsonError("projet_introuvable", 404, {}, cors);

    return json(
      { ok: true, validated, skipped: body.project_ids.length - validated },
      { headers: cors },
    );
  },
);
