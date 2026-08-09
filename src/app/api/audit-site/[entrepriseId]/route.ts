import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { analyserEntreprise } from "@/lib/audit-site/service";
import { UNDEFINED_TABLE, lireAudit } from "@/lib/audit-site/lecture";

/**
 * L'analyse d'une entreprise, à la demande.
 *
 * GET  — la dernière analyse, ou `{ disponible: false }` quand la migration
 *        n'est pas appliquée. Le badge du CRM se cache sur ce signal plutôt que
 *        d'afficher une erreur : une fonctionnalité absente ne doit pas
 *        ressembler à une panne.
 * POST — (ré)analyse maintenant. C'est le bouton « Analyser » de la fiche et du
 *        pipeline.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ entrepriseId: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const id = Number((await ctx.params).entrepriseId);
  if (!Number.isFinite(id)) return jsonError("Identifiant d'entreprise invalide.", 400);

  const res = await lireAudit(getServiceClient(), id);
  if (!res.disponible) return json({ disponible: false, motif: res.motif });
  return json({ disponible: true, audit: res.audit });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ entrepriseId: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const id = Number((await ctx.params).entrepriseId);
  if (!Number.isFinite(id)) return jsonError("Identifiant d'entreprise invalide.", 400);

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("entreprises")
    .select("id, site_web_canonique, nombre_avis, telephone")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return jsonError("Entreprise introuvable.", 404);
  const ent = data as {
    site_web_canonique: string | null;
    nombre_avis: number | null;
    telephone: string | null;
  };

  const resultat = await analyserEntreprise(sb, {
    entreprise_id: id,
    url: ent.site_web_canonique,
    nombre_avis: ent.nombre_avis,
    telephone: ent.telephone,
  }, { declencheur: "bouton" });

  if (resultat.statut === "erreur") {
    // La table peut manquer : on le nomme, plutôt que de laisser l'opérateur
    // conclure que le site du prospect est en cause.
    const manquante = resultat.message?.includes(UNDEFINED_TABLE);
    return jsonError(
      manquante
        ? "Analyse indisponible : sql/20260810_audit_site.sql n'est pas appliquée."
        : (resultat.message ?? "Analyse impossible."),
      manquante ? 503 : 502,
    );
  }

  const lu = await lireAudit(sb, id);
  return json({
    ok: true,
    statut: resultat.statut,
    audit: lu.disponible ? lu.audit : null,
  });
}
