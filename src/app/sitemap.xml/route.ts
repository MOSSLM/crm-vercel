import { headers } from "next/headers";
import { SITE_DOMAIN, normalizeHost, extractSubdomain, CRM_SUBDOMAINS } from "@/lib/site-domain";

/**
 * Le plan du site de la vitrine de l'agence.
 *
 * Volontairement court : tout le reste de l'app est soit derrière
 * l'authentification, soit déjà en `robots: { index: false }` (mentions
 * légales, bienvenue, pages RDV, collaboration freelance). Annoncer des URLs
 * non indexables apprend à Google à se méfier du fichier.
 *
 * Même contrôle d'hôte que le robots.txt racine, et pour la même raison : sans
 * lui, le sitemap de l'agence serait servi sous le domaine de chaque client.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const host = normalizeHost((await headers()).get("host"));
  const sousDomaine = extractSubdomain(host);
  const estAgence =
    host === SITE_DOMAIN || (sousDomaine !== null && CRM_SUBDOMAINS.has(sousDomaine));

  if (!estAgence) return new Response("Not found", { status: 404 });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>https://${SITE_DOMAIN}/</loc></url>\n` +
    `</urlset>\n`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
