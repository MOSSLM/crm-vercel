import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { UNDEFINED_TABLE } from "@/lib/audit-site/lecture";
import { rapportPublicUrl } from "@/lib/audit-site/rapport-url";
import { assurerJetonRapport, type JetonRapport } from "@/lib/audit-site/rapport";

/**
 * Le jeton de partage du rapport public.
 *
 * GET    — le jeton et son URL, ou `{ disponible: false }` si la migration
 *          manque. Crée le jeton à la première demande : un opérateur qui
 *          clique « Partager le rapport » veut un lien, pas un bouton
 *          « générer » suivi d'un second clic.
 * POST   — régénère le jeton (l'ancien lien cesse de fonctionner).
 * DELETE — révoque (`actif = false`). Le compteur de vues est conservé : il dit
 *          si le prospect avait ouvert le rapport avant qu'on le coupe.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JetonRow = JetonRapport;

function reponse(jeton: JetonRow): Response {
  return json({
    disponible: true,
    token: jeton.token,
    url: rapportPublicUrl(jeton.token),
    actif: jeton.actif,
    vues: jeton.vues ?? 0,
    vu_le: jeton.vu_le,
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ entrepriseId: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const id = Number((await ctx.params).entrepriseId);
  if (!Number.isFinite(id)) return jsonError("Identifiant d'entreprise invalide.", 400);

  const res = await assurerJetonRapport(getServiceClient(), id, auth.user.id);
  if (res.erreur) {
    if (res.erreur.code === UNDEFINED_TABLE) {
      return json({
        disponible: false,
        motif: "sql/20260810_rapport_public.sql n'est pas appliquée.",
      });
    }
    return jsonError(res.erreur.message, 500);
  }
  return reponse(res.jeton!);
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
  // `gen_random_bytes` côté base, comme le `default` : une seule source de
  // hasard, et jamais dans le bundle applicatif.
  const { data, error } = await sb
    .from("entreprises_rapport_public")
    .upsert(
      {
        entreprise_id: id,
        token: undefined,
        actif: true,
        cree_par: auth.user.id,
      },
      { onConflict: "entreprise_id" },
    )
    .select("entreprise_id, token, actif, vues, vu_le")
    .single();

  if (error) return jsonError(error.message, 500);
  return reponse(data as JetonRow);
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ entrepriseId: string }> },
): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const id = Number((await ctx.params).entrepriseId);
  if (!Number.isFinite(id)) return jsonError("Identifiant d'entreprise invalide.", 400);

  const { error } = await getServiceClient()
    .from("entreprises_rapport_public")
    .update({ actif: false })
    .eq("entreprise_id", id);

  if (error) return jsonError(error.message, 500);
  return json({ ok: true, actif: false });
}
