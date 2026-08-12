import { resolveSite, fetchBlogPosts } from "@/lib/site-resolver";
import { hostCanoniqueDuSite } from "@/lib/site-builder/host-canonique";
import { parseEnterpriseTags, slugsServis } from "@/lib/site-builder/pages-servies";

/**
 * Le plan du site, par tenant.
 *
 * UN ROUTE HANDLER ET PAS `sitemap.ts`. La convention Next produit le fichier à
 * la racine du segment et ne se laisse pas atteindre par une réécriture sur
 * segment dynamique : `/site/[subdomain]/sitemap.xml` n'aurait jamais été servi
 * pour `plomberie-dupont.fr/sitemap.xml`. C'est aussi pour ça que le middleware
 * doit explicitement laisser passer ce chemin — il est exclu du matcher ET de
 * la garde `pathname.includes(".")`, deux verrous indépendants.
 *
 * Les URLs sont bâties sur l'hôte CANONIQUE, pas sur l'hôte demandé : un sitemap
 * servi depuis le sous-domaine doit désigner le domaine du client, sinon on lui
 * fait indexer notre marque.
 *
 * Pas de `<lastmod>` : `SitemapPage` ne porte aucune date, et l'inventer
 * (`now()` à chaque requête) apprend à Google à ignorer le champ. L'omission est
 * délibérée.
 */
export const dynamic = "force-dynamic";

function echapper(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ subdomain: string }> },
) {
  const { subdomain } = await ctx.params;
  const site = await resolveSite(subdomain);

  // Hôte inconnu, site dépublié : rien à annoncer. 404 plutôt qu'un sitemap
  // vide, qui se lirait comme « ce site n'a aucune page ».
  if (!site) return new Response("Not found", { status: 404 });

  const host = hostCanoniqueDuSite(site);
  if (!host) return new Response("Not found", { status: 404 });

  const instances = (site.publishedInstances ?? []) as Array<{
    page_slug: string;
    is_hidden?: boolean;
  }>;
  const chemins = slugsServis({
    sitemap: site.publishedSitemap,
    instances,
    enterpriseTags: parseEnterpriseTags(site.enterpriseVariables ?? {}),
  });

  // Les articles ne viennent pas du plan du site mais de leur propre table :
  // sans cette seconde requête ils seraient absents du sitemap alors que ce
  // sont les pages les plus susceptibles d'être indexées.
  const articles = await fetchBlogPosts(site.siteId).catch(() => []);

  const urls = [
    ...chemins.map((c) => (c === "/" ? `${host}/` : `${host}/${c.replace(/^\/+/, "")}`)),
    ...articles.map((a) => `${host}/blog/${a.slug}`),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${echapper(u)}</loc></url>`).join("\n") +
    `\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
