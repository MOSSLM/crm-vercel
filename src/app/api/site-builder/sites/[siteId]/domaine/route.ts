import { revalidatePath } from "next/cache";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";
import { enregistrementsDns, normaliserDomaineClient } from "@/lib/site-builder/domaine-client";
import { verifierDnsDomaine } from "@/lib/site-builder/dns-domaine";
import { SITE_DOMAIN } from "@/lib/site-domain";

/**
 * Rattacher — ou détacher — le domaine du client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ROUTE N'EST PAS `/publish`
 * ─────────────────────────────────────────────────────────────────────────────
 * `publishSite` accepte déjà un `domain`, mais l'appeler REPUBLIE : il refige
 * le style, le plan du site, toutes les instances de sections et les variables
 * de l'entreprise depuis l'état COURANT du brouillon. Un domaine qu'on rattache
 * trois semaines après la mise en ligne emporterait donc au passage tout ce qui
 * a été bricolé dans l'éditeur depuis — sans que personne ne l'ait demandé.
 *
 * Le rattachement d'un domaine est une opération de ROUTAGE, pas de contenu :
 * il écrit une colonne et rien d'autre. C'est aussi pour ça qu'il ne touche pas
 * `published_at` — la comptabilité de publication doit rester celle du contenu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA VALIDATION FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Voir `domaine-client.ts` : le piège principal est un sous-domaine de chez nous
 * écrit dans `published_domain`, qui produit une ligne que RIEN ne peut
 * résoudre. Jusqu'ici la saisie partait telle quelle vers `publishSite`, qui
 * normalise sans juger et le documente.
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

/** L'état de rattachement d'un site, tel que l'écran de mise en ligne le lit. */
export const GET = withAuth<undefined, Params>({ role: "admin" }, async ({ req, params }) => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("published_domain, published_subdomain, is_published, paywall_enabled")
    .eq("id", params.siteId)
    .single();
  if (error) return jsonError(error.message, error.code === "PGRST116" ? 404 : 500);

  const ligne = data as {
    published_domain?: string | null;
    published_subdomain?: string | null;
    is_published?: boolean | null;
    paywall_enabled?: boolean | null;
  };
  const domaine = ligne.published_domain ?? null;

  // La lecture DNS est explicite : elle coûte deux requêtes réseau, et l'écran
  // s'ouvre bien plus souvent qu'on ne bascule un domaine.
  const veutDns = new URL(req.url).searchParams.get("dns") === "1";
  const dns = veutDns && domaine ? await verifierDnsDomaine(domaine) : null;

  return json({
    domaine,
    sousDomaine: ligne.published_subdomain ?? null,
    publie: Boolean(ligne.is_published),
    /**
     * La barre d'achat de la démo. Elle DOIT être retirée avant qu'un domaine
     * client serve le site : elle propose au visiteur d'acheter un site que le
     * client vient précisément de payer. Le webhook Stripe l'éteint tout seul
     * après un paiement en ligne — mais pas après un virement ou une facture,
     * c'est-à-dire dans la plupart des ventes.
     */
    barreDachat: Boolean(ligne.paywall_enabled),
    siteDomain: SITE_DOMAIN,
    enregistrements: domaine ? enregistrementsDns(domaine) : [],
    dns,
  });
});

export const POST = withAuth<undefined, Params>({ role: "admin" }, async ({ req, params }) => {
  const body = (await req.json().catch(() => ({}))) as { domaine?: string };
  const verdict = normaliserDomaineClient(body.domaine);
  if (!verdict.ok) return jsonError(verdict.erreur, 400);
  const domaine = verdict.domaine;

  const supabase = getServiceClient();

  // Contrôle explicite AVANT l'écriture, pour rendre un message lisible plutôt
  // qu'un 23505. L'index unique reste le garde-fou réel (migration 20260812) :
  // deux opérateurs simultanés passeraient tous les deux ce contrôle.
  const { data: occupant } = await supabase
    .from("sites")
    .select("id, name")
    .eq("published_domain", domaine)
    .neq("id", params.siteId)
    .maybeSingle();
  if (occupant) {
    const nom = (occupant as { name?: string | null }).name ?? "un autre site";
    return jsonError(`« ${domaine} » est déjà rattaché à ${nom}.`, 409);
  }

  const { data, error } = await supabase
    .from("sites")
    .update({ published_domain: domaine })
    .eq("id", params.siteId)
    .select("id, published_domain, published_subdomain, is_published, paywall_enabled")
    .single();
  if (error) {
    if (error.code === "23505") return jsonError(`« ${domaine} » est déjà rattaché à un autre site.`, 409);
    return jsonError(error.message, 500);
  }

  const ligne = data as { published_subdomain?: string | null; is_published?: boolean | null; paywall_enabled?: boolean | null };

  invalidateSiteCache(params.siteId);
  // Le domaine devient un SEGMENT de route à part entière : son cache est
  // distinct de celui du sous-domaine, et il est vide tant qu'on ne le purge pas.
  try { revalidatePath(`/site/${domaine}`, "layout"); } catch {}
  if (ligne.published_subdomain) {
    // L'ancienne adresse aussi : son canonical vient de changer de cible.
    try { revalidatePath(`/site/${ligne.published_subdomain}`, "layout"); } catch {}
  }

  return json({
    ok: true,
    domaine,
    enregistrements: enregistrementsDns(domaine),
    // Un domaine rattaché à un site NON publié ne sert rien : `resolveSite`
    // filtre sur `is_published`. Ce n'est pas une erreur — on prépare souvent le
    // DNS avant la mise en ligne — mais ça doit se dire.
    avertissement: ligne.is_published
      ? null
      : "Le site n'est pas publié : le domaine ne servira rien tant que tu n'auras pas cliqué « Publier ».",
    barreDachat: Boolean(ligne.paywall_enabled),
  });
});

/**
 * Détacher — c'est l'offboarding.
 *
 * La dépublication (`DELETE /publish`) ne touche que `is_published` et CONSERVE
 * le domaine, délibérément, pour qu'un client puisse revenir. Le revers est que
 * le domaine reste réservé : sans cette route, une valeur ne redevenait
 * libérable par aucun chemin de l'application, et le CRM continuait d'annoncer
 * comme adresse publique un domaine parti chez un repreneur.
 */
export const DELETE = withAuth<undefined, Params>({ role: "admin" }, async ({ params }) => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .update({ published_domain: null })
    .eq("id", params.siteId)
    .select("published_subdomain")
    .single();
  if (error) return jsonError(error.message, 500);

  invalidateSiteCache(params.siteId);
  const sub = (data as { published_subdomain?: string | null } | null)?.published_subdomain;
  if (sub) { try { revalidatePath(`/site/${sub}`, "layout"); } catch {} }

  return json({ ok: true, domaine: null });
});
