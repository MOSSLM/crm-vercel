import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";
import type { SeoMeta } from "@/types";

/**
 * Les valeurs SEO par défaut du site (`site_config.seo`).
 *
 * POURQUOI UNE ROUTE PLUTÔT QUE LE `PATCH site_config` GÉNÉRIQUE. `site_config`
 * est un JSONB écrit EN ENTIER par le PATCH générique : l'appelant doit détenir
 * l'objet complet. Or l'éditeur des designs Claude n'en charge qu'une tranche,
 * et `site_config` porte aussi le plan de redirection. Sauver le SEO depuis une
 * copie partielle effacerait donc les redirections enregistrées dans l'autre
 * onglet — silencieusement, et sans que rien ne le rattrape avant la prochaine
 * requête d'un visiteur sur une vieille URL.
 *
 * Ici la fusion se fait côté serveur, sur la valeur relue juste avant.
 */
/**
 * ADMIN SEULEMENT — et c'est une exception assumée dans cet arbre.
 *
 * Les 21 autres routes de `site-builder/[siteId]` sont en `withAuth({})`, donc
 * ouvertes à TOUT compte authentifié. Le garde-fou est côté interface
 * (`AppLayout` renvoie un freelance vers /espace-agent et un client vers
 * /espace-client), ce qui ne protège rien d'un appel direct avec un jeton
 * valide — et il existe aujourd'hui 2 comptes freelance et 1 compte client.
 *
 * On ne suit pas cette convention ici parce que ces routes-ci ne portent pas du
 * contenu : elles portent le ROUTAGE et le DNS. Détourner le domaine d'un
 * client, ou poser une redirection vers un site tiers, se répare beaucoup moins
 * vite qu'un texte de section. Aucune interface non-admin ne les appelle.
 */
export const dynamic = "force-dynamic";

type Params = { siteId: string };

const CHAMPS: (keyof SeoMeta)[] = ["metaTitle", "metaDescription", "ogTitle", "ogDescription", "ogImage", "ogType"];

export const PUT = withAuth<undefined, Params>({ role: "admin" }, async ({ req, params }) => {
  const body = (await req.json().catch(() => ({}))) as { seo?: Record<string, unknown> };
  if (!body.seo || typeof body.seo !== "object") return jsonError("seo requis", 400);

  // On ne recopie que les champs connus : une clé inattendue partirait sinon
  // dans l'instantané de publication et y resterait.
  const seo: Record<string, string> = {};
  for (const champ of CHAMPS) {
    const valeur = (body.seo as Record<string, unknown>)[champ];
    if (typeof valeur === "string" && valeur.trim()) seo[champ] = valeur.trim();
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.from("sites").select("site_config").eq("id", params.siteId).single();
  if (error) return jsonError(error.message, error.code === "PGRST116" ? 404 : 500);

  const config = ((data as { site_config?: Record<string, unknown> | null }).site_config ?? {}) as Record<string, unknown>;
  const { error: majErr } = await supabase
    .from("sites")
    .update({ site_config: { ...config, seo } })
    .eq("id", params.siteId);
  if (majErr) return jsonError(majErr.message, 500);

  invalidateSiteCache(params.siteId);
  // Les métadonnées sont servies depuis `published_site_config` : elles ne
  // partent en ligne qu'à la republication. C'est voulu — un titre en cours de
  // rédaction n'a rien à faire dans Google.
  return json({ ok: true, seo, republicationRequise: true });
});
