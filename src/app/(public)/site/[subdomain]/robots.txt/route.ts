import { resolveSite } from "@/lib/site-resolver";
import { hostCanoniqueDuSite } from "@/lib/site-builder/host-canonique";

/**
 * Le robots.txt d'un site publié.
 *
 * Deux choses : il annonce le sitemap, et il ne l'annonce QUE depuis l'adresse
 * officielle du site.
 *
 * Une fois un domaine client attaché, le sous-domaine `{label}.{SITE_DOMAIN}`
 * reste servi — rien ne le dépublie — et rend exactement les mêmes pages. La
 * désindexation de cet hôte-là ne se joue PAS ici : elle est portée page par
 * page par `noindex` (buildPageMetadata), et c'est délibéré. Un `Disallow: /`
 * aurait l'air plus ferme et ferait l'inverse de ce qu'on veut : interdire
 * l'exploration empêche le robot de lire le `noindex` ET le canonical, alors
 * qu'une URL partagée à l'extérieur (WhatsApp, mail) reste indexable par son
 * seul lien. On laisse donc explorer, et chaque page dit elle-même qu'elle ne
 * doit pas être indexée.
 *
 * On ne redirige PAS non plus : un 308 est permanent, mis en cache sans
 * expiration fiable, et une bonne part des liens de démo déjà envoyés pointent
 * ce sous-domaine (cf. l'en-tête de demo-share-url.ts).
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

  // Le sitemap n'est annoncé que depuis l'adresse officielle : servi depuis le
  // sous-domaine, il ferait indexer notre marque à la place du domaine client.
  const lignes = ["User-agent: *", "Allow: /", ...(estCanonique && canonique ? [`Sitemap: ${canonique}/sitemap.xml`] : [])];

  return new Response(lignes.join("\n") + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
