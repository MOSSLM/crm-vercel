import { headers } from "next/headers";
import { SITE_DOMAIN, normalizeHost, extractSubdomain, CRM_SUBDOMAINS } from "@/lib/site-domain";

/**
 * Le robots.txt de l'apex de l'agence — et le refus, pour tout le reste.
 *
 * L'apex nu (`samadigitalstudio.fr`) ne passe par aucune réécriture :
 * `extractSubdomain` teste `endsWith(".{SITE_DOMAIN}")`, ce qui est faux pour
 * l'apex lui-même. Il retombe donc sur l'arbre racine, tout comme `www.`,
 * `app.`, les aperçus de brouillon et n'importe quel hôte pointé chez nous mais
 * pas encore rattaché.
 *
 * D'où le contrôle d'hôte, sans lequel débloquer /robots.txt pour les tenants
 * ferait servir le fichier de l'agence sous CHAQUE hôte — y compris le domaine
 * du plombier. C'est le pendant exact du robots.txt par tenant.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const host = normalizeHost((await headers()).get("host"));
  const sousDomaine = extractSubdomain(host);
  const estAgence =
    host === SITE_DOMAIN || (sousDomaine !== null && CRM_SUBDOMAINS.has(sousDomaine));

  if (!estAgence) {
    // Aperçus de brouillon et hôtes non rattachés : rien à explorer. Les
    // aperçus portent déjà un `robots: noindex` dans leur metadata ; ceci ferme
    // la porte au niveau du crawl.
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-robots-tag": "noindex",
      },
    });
  }

  const lignes = [
    "User-agent: *",
    "Allow: /$",
    // Le CRM n'a rien à faire dans un index. Ces chemins portent déjà
    // `robots: { index: false }` dans leur metadata ; on évite en plus la
    // dépense de crawl.
    "Disallow: /dashboard",
    "Disallow: /espace-agent",
    "Disallow: /espace-client",
    "Disallow: /portail",
    "Disallow: /site/",
    "Disallow: /preview/",
    "Disallow: /api/",
    "Disallow: /login",
    `Sitemap: https://${SITE_DOMAIN}/sitemap.xml`,
  ];

  return new Response(lignes.join("\n") + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
