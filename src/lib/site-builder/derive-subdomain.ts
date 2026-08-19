/**
 * Demo subdomain helpers for bulk site creation.
 *
 * A company's real website URL (entreprises.canonical_url / site_web_canonique)
 * is turned into a demo subdomain label, e.g.
 *   "https://www.ecotherme.fr/contact" → "ecotherme"
 * which serves the demo at {label}.samadigitalstudio.fr. We never modify the
 * company's real data — the label is only used for the generated site's
 * published_subdomain.
 */
import { RESERVED_SUBDOMAINS } from "@/lib/site-domain";

/** Strip protocol/www/path, keep the registrable domain label, slugify to the
 *  [a-z0-9-] charset the publish route enforces. Falls back to `fallback`
 *  (e.g. the company name) when the URL is empty.
 *
 * Une URL de prospect peut être un sous-domaine métier (`chaudiere.client.fr`).
 * Pour l'adresse démo, on veut alors la marque (`client.samadigitalstudio.fr`),
 * pas la verticale (`chaudiere.samadigitalstudio.fr`). */
export function deriveSubdomainLabel(url: string | null | undefined, fallback = ""): string {
  let s = (url ?? "").trim().toLowerCase();
  const fromUrl = Boolean(s);
  if (!s) s = (fallback ?? "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");           // protocol
  s = s.replace(/^www\./, "");                 // leading www.
  s = s.split(/[/?#]/)[0] ?? s;                // host only
  s = fromUrl ? registrableLabel(s) : s;       // brand label, not subdomain
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents
  s = s.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  return s;
}

const GENERIC_HOST_SUFFIXES = [
  "wixsite.com",
  "wix.com",
  "webflow.io",
  "wordpress.com",
  "myshopify.com",
  "squarespace.com",
  "weebly.com",
  "godaddysites.com",
] as const;

function registrableLabel(host: string): string {
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return host;

  const normalizedHost = labels.join(".");
  // Hébergeurs mutualisés : leur domaine enregistrable (`wixsite`, `webflow`,
  // etc.) n'est PAS la marque du prospect. On garde donc le premier sous-domaine
  // personnalisé, comme avant, au lieu de publier tout le monde sur
  // `wixsite.samadigitalstudio.fr`.
  if (GENERIC_HOST_SUFFIXES.some((suffix) => normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`))) {
    return labels[0] ?? host;
  }

  const [tld, sld] = labels.slice(-2).reverse();
  // Common public suffixes with a second-level registry (`example.co.uk`,
  // `example.com.au`) need one extra label to recover the brand. This is not a
  // full PSL parser; it covers the frequent pasted URLs without a dependency.
  const secondLevelPublicSuffixes = new Set(["co", "com", "org", "net", "ac", "gov"]);
  if (tld.length === 2 && secondLevelPublicSuffixes.has(sld) && labels.length >= 3) {
    return labels.at(-3) ?? host;
  }

  return sld;
}

/**
 * Return a subdomain unique among `taken`, appending -2, -3… on collision.
 *
 * Les labels réservés à l'application (`app`, `www`, `api`, `rapport`…) sont
 * traités comme déjà pris. Sans ça, un client dont le site est « rapport.fr »
 * ou « app.fr » se voyait attribuer ce label et s'appropriait l'hôte de
 * l'application — le déploiement ne consultait que les sous-domaines DÉJÀ
 * attribués, et aucune liste de réservation n'existait. Le trou était ouvert
 * pour `app` depuis l'origine ; le fermer ici le ferme pour tous les appelants
 * à la fois, présents et futurs.
 */
export function uniqueSubdomain(label: string, taken: Set<string>): string {
  const base = label || "site";
  const pris = (l: string) => taken.has(l) || RESERVED_SUBDOMAINS.has(l);
  if (!pris(base)) return base;
  let i = 2;
  while (pris(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
