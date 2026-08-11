import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { UNDEFINED_TABLE } from "@/lib/audit-site/lecture";
import { assurerJetonRapport } from "@/lib/audit-site/rapport";
import { rapportPublicUrl } from "@/lib/audit-site/rapport-url";

/**
 * Les deux lead magnets d'un prospect, rassemblés pour le cockpit d'appel.
 *
 * POURQUOI UNE ROUTE PLUTÔT QUE TROIS APPELS DEPUIS LE NAVIGATEUR. Le panneau
 * s'affiche à chaque changement de prospect dans la file — c'est-à-dire des
 * dizaines de fois par session. Trois allers-retours (le site, l'audit, le
 * jeton du rapport) à chaque clic donnent un panneau qui se remplit par
 * morceaux pendant que l'agent parle déjà. Un seul appel, une seule attente.
 *
 * LE JETON DU RAPPORT EST CRÉÉ ICI SI BESOIN, comme le fait déjà
 * `/api/rapport-public/[entrepriseId]` : un agent qui ouvre le panneau veut un
 * lien à envoyer, pas un bouton « générer » suivi d'un second clic. Le jeton
 * n'expose rien de plus que la page qu'il ouvre.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth({}, async ({ req, user }) => {
  const { searchParams } = new URL(req.url);
  const entrepriseId = Number(searchParams.get("entreprise"));
  const opportuniteId = searchParams.get("opportunite");

  if (!Number.isFinite(entrepriseId)) return jsonError("entreprise_invalide", 400);

  const sb = getServiceClient();

  const [siteRes, auditRes, jetonRes] = await Promise.all([
    sb
      .from("sites")
      .select(
        "id, name, published_subdomain, is_published, paywall_enabled, build_stage, og_image_url",
      )
      .eq("enterprise_id", entrepriseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    opportuniteId
      ? sb
          .from("audits")
          .select("id, statut, pdf_url, updated_at")
          .eq("opportunite_id", opportuniteId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    assurerJetonRapport(sb, entrepriseId, user.id),
  ]);

  // Un site absent n'est pas une erreur : beaucoup de prospects de la file
  // n'en ont pas encore. Le panneau le dit et propose d'en créer un.
  const site = siteRes.error ? null : siteRes.data;

  // L'audit est le document de vente (`audits`) ; le rapport est la page
  // publique de mesure du site actuel. Deux objets, deux liens, deux moments
  // de la conversation — d'où deux blocs distincts côté panneau.
  const audit = auditRes.error ? null : auditRes.data;

  let rapport: { disponible: boolean; url?: string; vues?: number; vu_le?: string | null; motif?: string } = {
    disponible: false,
  };
  if (jetonRes.erreur) {
    rapport = {
      disponible: false,
      motif:
        jetonRes.erreur.code === UNDEFINED_TABLE
          ? "sql/20260810_rapport_public.sql n'est pas appliquée."
          : jetonRes.erreur.message,
    };
  } else if (jetonRes.jeton) {
    rapport = {
      disponible: jetonRes.jeton.actif,
      url: rapportPublicUrl(jetonRes.jeton.token),
      vues: jetonRes.jeton.vues ?? 0,
      vu_le: jetonRes.jeton.vu_le ?? null,
    };
  }

  return json({ site, audit, rapport });
});
