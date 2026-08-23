import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";
import { parseRegles, verifierPlan } from "@/lib/site-builder/redirections";
import { parseEnterpriseTags, slugsServis } from "@/lib/site-builder/pages-servies";
import type { SitemapPage } from "@/types";

/**
 * Le plan de redirection d'un site : lecture et écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ON ÉCRIT DANS L'INSTANTANÉ PUBLIÉ, ET POURQUOI C'EST L'EXCEPTION
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle de la maison est stricte : un site publié ne lit QUE son instantané,
 * jamais l'état courant du brouillon (« strict snapshot lock », site-resolver).
 * C'est ce qui empêche une retouche en cours d'éditeur de fuir en production.
 *
 * Une redirection n'est pas du contenu : c'est du routage. Et le moment où on
 * en a besoin est précisément celui où l'on ne veut PAS republier — le domaine
 * vient de basculer, une vieille URL oubliée rend 404, il faut la rattraper
 * maintenant sans emporter au passage trois semaines de bricolage dans
 * l'éditeur.
 *
 * D'où l'écriture des DEUX côtés : `site_config.redirections` (pour que la
 * prochaine publication conserve le plan) et `published_site_config.redirections`
 * (pour qu'il s'applique tout de suite). Aucune autre clé de l'instantané n'est
 * touchée : on relit l'objet, on remplace cette seule entrée, on réécrit.
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

const COLONNES =
  "sitemap, site_config, published_site_config, published_sitemap, published_instances, published_variables, is_published";

interface LigneSite {
  sitemap?: SitemapPage[] | null;
  site_config?: Record<string, unknown> | null;
  published_site_config?: Record<string, unknown> | null;
  published_sitemap?: SitemapPage[] | null;
  published_instances?: Array<{ page_slug: string; is_hidden?: boolean }> | null;
  published_variables?: Record<string, string> | null;
  is_published?: boolean | null;
}

/**
 * Les chemins que le site sert RÉELLEMENT — la liste sur laquelle le plan se
 * relit. Sans elle, l'éditeur ne peut ni signaler une cible qui rendrait 404,
 * ni une règle inerte parce que la source existe déjà.
 */
async function cheminsServis(siteId: string, ligne: LigneSite): Promise<string[]> {
  if (ligne.is_published && ligne.published_instances) {
    return slugsServis({
      sitemap: ligne.published_sitemap,
      instances: ligne.published_instances,
      enterpriseTags: parseEnterpriseTags(ligne.published_variables ?? {}),
    });
  }
  // Site pas encore publié : on relit l'état courant, seule vérité disponible.
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("site_section_instances")
    .select("page_slug, is_hidden")
    .eq("site_id", siteId);
  return slugsServis({
    sitemap: ligne.sitemap,
    instances: (data ?? []) as Array<{ page_slug: string; is_hidden?: boolean }>,
    // Pas de variables figées avant publication : aucun filtrage par service.
    // Une page tagguée est donc listée — mieux vaut une cible de trop qu'un
    // faux avertissement sur une page qui existe.
    enterpriseTags: [],
  });
}

export const GET = withAuth<undefined, Params>({ role: "admin" }, async ({ params }) => {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("sites").select(COLONNES).eq("id", params.siteId).single();
  if (error) return jsonError(error.message, error.code === "PGRST116" ? 404 : 500);

  const ligne = data as unknown as LigneSite;
  const brouillon = parseRegles((ligne.site_config as { redirections?: unknown } | null)?.redirections);
  const publiees = parseRegles((ligne.published_site_config as { redirections?: unknown } | null)?.redirections);
  const servis = await cheminsServis(params.siteId, ligne);

  return json({
    regles: brouillon,
    /** Ce qui s'applique en ce moment sur le site en ligne. */
    reglesPubliees: publiees,
    cheminsServis: servis,
    diagnostics: verifierPlan(brouillon, servis),
  });
});

export const PUT = withAuth<undefined, Params>({ role: "admin" }, async ({ req, params }) => {
  const body = (await req.json().catch(() => ({}))) as { regles?: unknown };
  const regles = parseRegles(body.regles);
  if (!Array.isArray(body.regles)) return jsonError("regles doit être un tableau", 400);

  const supabase = getServiceClient();
  const { data, error } = await supabase.from("sites").select(COLONNES).eq("id", params.siteId).single();
  if (error) return jsonError(error.message, error.code === "PGRST116" ? 404 : 500);

  const ligne = data as unknown as LigneSite;
  const servis = await cheminsServis(params.siteId, ligne);
  const diagnostics = verifierPlan(regles, servis);
  // Les erreurs bloquent, les avertissements non : une cible « inconnue » est
  // légitime pour un article de blog ou une page à venir, alors qu'une boucle
  // ou une règle sur elle-même n'a aucune lecture valable.
  const bloquantes = diagnostics.filter((d) => d.gravite === "erreur");
  if (bloquantes.length > 0) {
    return jsonError(bloquantes[0].message, 400, { diagnostics });
  }

  const patch: Record<string, unknown> = {
    site_config: { ...((ligne.site_config as Record<string, unknown> | null) ?? {}), redirections: regles },
  };
  // On ne CRÉE pas d'instantané : un site jamais publié n'en a pas, et en
  // fabriquer un ici ferait croire au résolveur qu'il peut servir le site.
  if (ligne.published_site_config) {
    patch.published_site_config = { ...ligne.published_site_config, redirections: regles };
  }

  const { error: majErr } = await supabase.from("sites").update(patch).eq("id", params.siteId);
  if (majErr) return jsonError(majErr.message, 500);

  invalidateSiteCache(params.siteId);
  return json({
    ok: true,
    regles,
    diagnostics,
    /** Vrai quand le plan s'applique DÉJÀ en ligne (pas besoin de republier). */
    enLigne: Boolean(ligne.published_site_config),
  });
});
