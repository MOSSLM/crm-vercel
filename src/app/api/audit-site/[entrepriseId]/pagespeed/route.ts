import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { mesurerEtEnregistrer } from "@/lib/audit-site/pagespeed";
import { lireAudit } from "@/lib/audit-site/lecture";

/**
 * POST /api/audit-site/{entrepriseId}/pagespeed — « Mesurer avec Google ».
 *
 * À LA DEMANDE UNIQUEMENT, et c'est structurel : PSI fait tourner un vrai
 * Chrome, prend des dizaines de secondes, et son quota — même avec clé — n'est
 * pas dimensionné pour 2 800 entreprises. C'est un finisseur par prospect,
 * appelé quand on s'apprête à parler à quelqu'un, pas un outil de parc. Aucun
 * cron ne l'appelle, aucune action de masse ne l'expose.
 *
 * L'URL mesurée est celle que l'analyseur a RÉELLEMENT atteinte (`url_finale`),
 * pas celle de la fiche : mesurer une URL qui redirige donnerait des chiffres
 * portant sur une autre page que celle qu'on a notée.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ entrepriseId: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const id = Number((await ctx.params).entrepriseId);
  if (!Number.isFinite(id)) return jsonError("Identifiant d'entreprise invalide.", 400);

  const sb = getServiceClient();
  const lu = await lireAudit(sb, id);
  if (!lu.disponible) return jsonError(lu.motif, 503);
  if (!lu.audit) {
    return jsonError("Analysez d'abord le site : PageSpeed complète une analyse, il ne la remplace pas.", 409);
  }
  if (lu.audit.injoignable) {
    return jsonError("Le site est injoignable — PageSpeed n'aurait rien à mesurer.", 409);
  }

  const url = lu.audit.url_finale ?? lu.audit.url_analysee;
  if (!url) return jsonError("Aucune URL à mesurer.", 409);

  const res = await mesurerEtEnregistrer(sb, id, url);
  if (!res.ok) return jsonError(res.erreur, 502);

  const relu = await lireAudit(sb, id);
  return json({ ok: true, mesure: res.mesure, audit: relu.disponible ? relu.audit : null });
}
