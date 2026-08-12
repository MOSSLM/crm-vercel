import { resolveSite } from "@/lib/site-resolver";
import { hostCanoniqueDuSite } from "@/lib/site-builder/host-canonique";

/**
 * Le robots.txt d'un site publié.
 *
 * Deux choses, et la seconde est celle qui compte : il annonce le sitemap, et
 * il DÉSINDEXE l'hôte qui n'est pas l'adresse officielle du site.
 *
 * Une fois un domaine client attaché, le sous-domaine `{label}.{SITE_DOMAIN}`
 * reste servi — rien ne le dépublie — et rend exactement les mêmes pages. Le
 * canonical dit à Google laquelle retenir, mais c'est une recommandation. Sur
 * l'hôte non canonique on ajoute donc `noindex` par en-tête, ce qui ne dépend
 * d'aucune interprétation. On ne redirige PAS : un 308 est permanent, mis en
 * cache sans expiration fiable, et une bonne part des liens de démo déjà
 * envoyés pointent ce sous-domaine (cf. l'en-tête de demo-share-url.ts).
 *
 * Ce fichier est un Route Handler et pas la convention `robots.ts` : voir la
 * note de sitemap.xml/route.ts.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ subdomain: string }> },
) {
  const { subdomain } = await ctx.params;
  const site = await resolveSite(subdomain);

  // Hôte inconnu : ne rien laisser explorer. C'est aussi ce que reçoit un
  // domaine pointé chez nous mais pas encore rattaché à un site.
  if (!site) {
    return new Response("User-agent: *\nDisallow: /\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const canonique = hostCanoniqueDuSite(site);
  // `subdomain` porte le segment de route : un label, ou l'hôte demandé.
  const demande = subdomain.includes(".")
    ? `https://${subdomain}`
    : canonique;
  const estCanonique = !canonique || !demande || demande === canonique;

  const lignes = estCanonique
    ? ["User-agent: *", "Allow: /", ...(canonique ? [`Sitemap: ${canonique}/sitemap.xml`] : [])]
    : ["User-agent: *", "Disallow: /"];

  return new Response(lignes.join("\n") + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(estCanonique ? {} : { "x-robots-tag": "noindex" }),
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
