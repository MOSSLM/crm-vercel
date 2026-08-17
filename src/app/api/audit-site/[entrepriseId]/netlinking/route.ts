import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { lireAudit } from "@/lib/audit-site/lecture";
import {
  domaineDe,
  mesurerNetlinking,
  netlinkingEstFrais,
  preuvesNetlinking,
} from "@/lib/audit-site/netlinking";

/**
 * POST /api/audit-site/{entrepriseId}/netlinking — « qui parle de ce domaine ».
 *
 * Un appel, une seconde, gratuit. À l'inverse de PageSpeed, rien n'empêcherait
 * de le passer sur tout le parc : cent domaines par appel et trente mille par
 * mois. Il reste néanmoins par entreprise ici, parce que c'est la préparation
 * d'un audit qui en a besoin — le balayage de parc viendra avec sa propre route
 * de lot, qui groupera les domaines au lieu de les appeler un par un.
 *
 * COMME LA CLÉ PAGESPEED, LA CLÉ RESTE SUR LE SERVEUR. L'agent qui prépare
 * l'audit appelle cette route ; il n'a jamais à connaître `OPEN_PAGERANK_API_KEY`,
 * elle n'apparaît dans aucune configuration locale ni dans aucun transcript, et
 * le quota se surveille au même endroit que la dépense.
 *
 * L'ÉCRITURE SE FAIT DANS `detail`, PAS DANS UNE COLONNE. Un `upsert` qui nomme
 * une colonne absente échoue entièrement, et les migrations s'appliquent à la
 * main sur ce projet. Le JSONB existe déjà ; la note se recalcule à la lecture.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
    return jsonError(
      "Analysez d'abord le site : c'est l'analyse qui détermine l'adresse réellement atteinte.",
      409,
    );
  }

  // Le domaine mesuré est celui RÉELLEMENT atteint après redirections. Un
  // prospect qui a migré de `ancien.fr` vers `nouveau.fr` a deux domaines
  // d'autorité très différents, et c'est celui qu'il sert aujourd'hui qui compte.
  const domaine = domaineDe(lu.audit.url_finale ?? lu.audit.url_analysee);
  if (!domaine) return jsonError("Aucun domaine à interroger.", 409);

  const { data: ligne } = await sb
    .from("entreprises_audit_site")
    .select("detail")
    .eq("entreprise_id", id)
    .maybeSingle();

  const detail = ((ligne as { detail?: Record<string, unknown> } | null)?.detail ?? {}) as Record<
    string,
    unknown
  >;

  // Une mesure de moins de trente jours vaut la précédente : Common Crawl n'a
  // pas bougé entre-temps, et le quota mensuel n'est pas fait pour être dépensé
  // deux fois sur la même question.
  if (netlinkingEstFrais(detail.netlinking_le as string | undefined)) {
    return json({ ok: true, rejoue: false, audit: lu.audit });
  }

  const rangs = await mesurerNetlinking([domaine]);
  if (rangs.size === 0) {
    return jsonError(
      "Open PageRank n'a rien rendu — clé absente, quota atteint, ou service indisponible.",
      502,
    );
  }

  const preuves = preuvesNetlinking(rangs.get(domaine) ?? null);
  if (preuves.length === 0) {
    return jsonError("Domaine inconnu du graphe de liens : aucun axe publiable.", 422);
  }

  const { error } = await sb
    .from("entreprises_audit_site")
    .update({
      detail: { ...detail, netlinking: preuves, netlinking_le: new Date().toISOString() },
    })
    .eq("entreprise_id", id);
  if (error) return jsonError(error.message, 500);

  const relu = await lireAudit(sb, id);
  return json({
    ok: true,
    rejoue: true,
    domaine,
    audit: relu.disponible ? relu.audit : null,
  });
}
