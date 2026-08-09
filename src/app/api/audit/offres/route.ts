import { json } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { versOffreAudit, type OffreAudit } from "@/lib/audit/offres-audit";

/**
 * Les offres que l'audit a le droit de proposer.
 *
 * Le filtrage se fait ICI et nulle part ailleurs : une offre sans
 * `metadata.role_audit` ne sort jamais de cette route, donc aucune page ne peut
 * la proposer par inadvertance. C'est un opt-in, parce que le catalogue contient
 * des offres préparatoires qui ne sont pas encore vendables.
 *
 * Dégradation : catalogue absent, migration non appliquée, ou aucune offre
 * qualifiée ⇒ `{ offres: [] }` et un motif. L'éditeur garde alors les tarifs
 * déjà présents dans le document — mieux vaut un tarif à revoir qu'une page de
 * tarifs vide devant un prospect.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { data, error } = await getServiceClient()
    .from("offres")
    // `*` : `metadata` et `billing_period` ont été ajoutés par des migrations
    // successives, et nommer une colonne absente ferait échouer la requête
    // entière au lieu de rendre moins.
    .select("*")
    .eq("actif", true);

  if (error) return json({ offres: [], motif: error.message });

  const offres = (data ?? [])
    .map((row) => versOffreAudit(row as Record<string, unknown>))
    .filter((o): o is OffreAudit => o !== null);

  return json({
    offres,
    motif: offres.length === 0 ? "aucune offre ne porte de rôle d'audit" : undefined,
  });
}
