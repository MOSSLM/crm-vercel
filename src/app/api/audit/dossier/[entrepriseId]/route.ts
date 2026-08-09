import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { construireDossier } from "@/lib/audit/dossier";

/**
 * `GET /api/audit/dossier/{entrepriseId}` — tout ce qu'on a le droit de dire
 * d'une entreprise, en un seul aller-retour.
 *
 * Destiné au passage local qui qualifie et enrichit déjà : préparer l'audit y
 * devient une étape de plus, sur un contexte déjà chargé, plutôt qu'une session
 * séparée qui recommencerait à zéro.
 *
 * Le champ `univers` n'est pas un résumé de confort : c'est la référence exacte
 * que `POST /api/audit/preparation` utilisera pour accepter ou refuser la
 * rédaction. Ce qui n'y figure pas ne franchira pas l'écriture — autant le
 * savoir avant d'écrire qu'après.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ entrepriseId: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const id = Number((await ctx.params).entrepriseId);
  if (!Number.isFinite(id)) return jsonError("Identifiant d'entreprise invalide.", 400);

  const dossier = await construireDossier(getServiceClient(), id);
  if (!dossier) return jsonError("Entreprise introuvable.", 404);

  return json(dossier);
}
