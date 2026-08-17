import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { appliquerPreparation } from "@/lib/audit/appliquer-preparation";

/**
 * `POST /api/audit/preparation` — accepter une rédaction, sous contrat.
 *
 * Corps attendu : `{ opportunite_id, entreprise_id, preparation }`.
 *
 * LE CONTRAT LUI-MÊME VIT DANS `lib/audit/appliquer-preparation`, et pas ici.
 * Cette route n'a plus que ce qui la regarde : la session, le corps JSON, les
 * codes HTTP. Le cœur est appelé à l'identique par le script d'atelier, qui
 * prépare un dossier sans session — sans quoi il faudrait le recopier, et il
 * divergerait au premier changement de barème.
 *
 * Ce que fait le cœur, dans l'ordre : il reconstruit le dossier — donc l'univers
 * du dicible —, soumet la rédaction aux quatre règles, écrit ce qui passe, et
 * REND CE QUI NE PASSE PAS. Les rejets sont nommés un par un : c'est ce qui
 * permet à l'appelant de corriger plutôt que de deviner.
 *
 * Le repli n'est pas un échec. Une rédaction entièrement rejetée laisse l'audit
 * avec le texte du catalogue : moins ajusté, toujours vrai, toujours envoyable.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { opportunite_id?: string; entreprise_id?: number; preparation?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }

  const opportuniteId = body.opportunite_id;
  const entrepriseId = Number(body.entreprise_id);
  if (!opportuniteId || !Number.isFinite(entrepriseId)) {
    return jsonError("opportunite_id et entreprise_id requis.", 400);
  }

  const res = await appliquerPreparation(getServiceClient(), {
    opportuniteId,
    entrepriseId,
    preparation: body.preparation,
    userId: auth.user.id,
  });

  if (res.erreur) return jsonError(res.erreur.message, res.erreur.statut);

  const { erreur: _ignore, ...corps } = res;
  return json(corps);
}
