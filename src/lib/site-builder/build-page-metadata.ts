import type { Metadata } from "next";
import type { ResolvedSite } from "@/lib/site-resolver";
import type { SitemapPage } from "@/types";
import { interpolateVars } from "@/lib/site-builder/interpolate-vars";
import { getAppUrl } from "@/lib/app-url";
import { urlCanonique } from "@/lib/site-builder/host-canonique";

/**
 * URL de SECOURS de la carte de partage — celle qui la fabrique à la volée.
 *
 * CE N'EST PAS LE CHEMIN NORMAL. Une fois la carte fabriquée, `og:image` pointe
 * directement l'objet du CDN Supabase (`sites.og_image_url`), servi en statique
 * sans invoquer la moindre fonction. Cette route-ci ne sert que tant que la
 * carte n'existe pas encore.
 *
 * Pourquoi sur l'hôte du CRM plutôt que sur celui du site :
 *
 *   - c'est un hôte que NOUS contrôlons. Un site publié peut vivre sur le
 *     domaine du client (`published_domain`) : son DNS et son certificat nous
 *     échappent, et une image de partage qui dépend d'eux tombe avec eux ;
 *   - c'est une base absolue unique, alors que l'hôte de la page varie selon
 *     qu'on est sur un sous-domaine publié, un domaine client ou un aperçu
 *     brouillon en UUID.
 *
 * (Une note antérieure affirmait ici que `/api` n'existait pas sur les hôtes de
 * site parce que le middleware y réécrivait tout. C'est FAUX : `src/middleware.ts`
 * saute explicitement `/api`. La route répondrait donc aussi bien depuis l'hôte
 * du site — le choix tient aux deux raisons ci-dessus, pas à une contrainte de
 * routage.)
 */
export function demoOgImageUrl(
  siteId: string,
  opts: { origine?: string | null; version?: string | null } = {},
): string {
  const base = opts.origine ?? getAppUrl();
  // Le suffixe de version porte le hash du fichier stocké. Sans lui, l'URL de
  // la carte ne changerait jamais : un client qui la garde en cache — navigateur,
  // Slack, Facebook — resservirait indéfiniment la première version, alors même
  // qu'on a régénéré. C'est la même raison qui fait hacher le nom du fichier
  // dans le stockage ; ici on la reporte sur l'URL publique.
  const v = opts.version ? `?v=${opts.version}` : "";
  return `${base}/api/og/demo/${siteId}${v}`;
}

/**
 * Le hash contenu dans le nom du fichier déposé (`card-<hash>.jpg`), pour
 * versionner l'URL publique. `null` si l'image n'existe pas encore.
 */
export function versionDepuisUrl(url: string | null | undefined): string | null {
  const nom = (url ?? "").split("/").pop() ?? "";
  return /-([0-9a-f]{8,32})\.[a-z0-9]+$/i.exec(nom)?.[1] ?? null;
}

/** L'hôte d'une URL, ou null si elle est illisible. Comparaison seulement. */
function hoteDe(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Builds the Next.js Metadata for a published site page.
 *
 * Cascade for every field: per-page value → site-level seo default → fallback.
 * All values support `{{ variables }}` (interpolated from the published
 * enterprise variables snapshot). Emits OpenGraph + Twitter card tags.
 *
 * Shared by the home route and the catch-all route so both stay consistent.
 */
export function buildPageMetadata(
  site: ResolvedSite,
  page: SitemapPage | undefined,
  fallbackTitle: string,
  /** Origine réellement demandée, pour servir la carte depuis le MÊME hôte. */
  origine?: string | null,
  /** Chemin de la page, pour l'adresse canonique. « / » ou « /contact ». */
  pageSlug?: string,
): Metadata {
  const vars = site.enterpriseVariables ?? {};
  const seo = site.seo ?? {};
  // `fallbackTitle` reçoit le SEGMENT DE ROUTE, qui porte désormais un hôte
  // complet quand le site a un domaine propre. Un site sans companyName
  // titrerait donc « plomberie-dupont.fr » et « Site de plomberie-dupont.fr »,
  // dans Google et dans l'unfurl WhatsApp — et différemment selon l'URL
  // empruntée, ce qui contredirait le canonical qu'on ajoute ici. On retombe
  // donc sur le label publié, qui ne dépend pas de l'hôte de la requête.
  const repli = site.publishedSubdomain?.trim() || (fallbackTitle.includes(".") ? "" : fallbackTitle);
  const companyName = site.companyName ?? repli;
  const ip = (v?: string | null) => (v ? interpolateVars(v, vars) : "");

  const title =
    ip(page?.metaTitle) || ip(seo.metaTitle) || (page ? `${page.title} — ${companyName}` : companyName);
  const description =
    ip(page?.metaDescription) || ip(seo.metaDescription) || `Site de ${companyName}`;
  const ogTitle = ip(page?.ogTitle) || ip(seo.ogTitle) || title;
  const ogDescription = ip(page?.ogDescription) || ip(seo.ogDescription) || description;
  const icon = site.faviconUrl ?? site.logoUrl ?? "/favicon.ico";

  // Ordre délibéré : ce que l'opérateur a choisi, puis la carte fabriquée, puis
  // la route qui la fabrique à la volée.
  //
  // `site.logoUrl` a été RETIRÉ de ce repli. C'était le défaut d'origine : un
  // logo carré servi comme image OpenGraph et annoncé 1200×630. WhatsApp
  // l'étirait, ou ne l'affichait pas du tout.
  const chosenImage = ip(page?.ogImage) || ip(seo.ogImage) || "";
  // Toujours la route, jamais l'URL de stockage en direct : elle sert les
  // octets depuis l'hôte du site, sans redirection. Un robot d'unfurl qui ne
  // suit pas les redirections pour une image — il en existe — repartait sinon
  // sans vignette.
  const generatedImage = demoOgImageUrl(site.siteId, {
    origine,
    version: versionDepuisUrl(site.ogImageUrl),
  });

  // `width`/`height` ne sont annoncés QUE pour l'image dont on connaît le
  // format. Mentir sur les dimensions d'une image choisie à la main, c'est
  // reproduire le bug qu'on corrige — en moins visible.
  const images = chosenImage
    ? [{ url: chosenImage }]
    : [{ url: generatedImage, width: 1200, height: 630 }];

  // L'adresse officielle du site, indépendante de l'hôte emprunté. Volontairement
  // PAS calculée depuis `origine` : ce serait un self-canonical sur chaque
  // espace d'URL, donc aucune déduplication (voir host-canonique.ts).
  const canonical = urlCanonique(site, pageSlug ?? "/");

  // NOINDEX SUR L'HÔTE QUI N'EST PAS L'ADRESSE OFFICIELLE.
  //
  // Une fois un domaine client attaché, le sous-domaine `{label}.{SITE_DOMAIN}`
  // continue de servir les MÊMES pages : rien ne le dépublie, et c'est voulu —
  // des liens de démo déjà envoyés pointent dessus. Le canonical dit à Google
  // laquelle des deux retenir, mais ce n'est qu'une recommandation.
  //
  // Le `Disallow: /` du robots.txt par tenant ne suffit PAS à fermer le trou, et
  // le referme même à moitié : interdire l'exploration empêche le robot de LIRE
  // le canonical, alors qu'une URL partagée à l'extérieur (WhatsApp, mail) reste
  // indexable par son seul lien. La paire correcte est l'inverse : on laisse
  // explorer, et chaque page de l'hôte non canonique porte `noindex`, qui ne
  // s'interprète pas. `follow` reste vrai pour que le canonical et les liens
  // internes soient tout de même suivis.
  const hoteDemande = origine ? hoteDe(origine) : null;
  const hoteOfficiel = canonical ? hoteDe(canonical) : null;
  const horsAdresseOfficielle = Boolean(hoteDemande && hoteOfficiel && hoteDemande !== hoteOfficiel);

  return {
    title,
    description,
    icons: { icon },
    // Sans `metadataBase`, Next ne sait pas rendre absolue une URL relative et
    // laisse tomber la balise sans rien dire.
    metadataBase: new URL(origine ?? getAppUrl()),
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(horsAdresseOfficielle ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: "website",
      ...(canonical ? { url: canonical } : {}),
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: images?.map((i) => i.url),
    },
  };
}
