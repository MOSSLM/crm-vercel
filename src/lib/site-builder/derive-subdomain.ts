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

/** Strip protocol/www/path, take the label before the first dot, slugify to the
 *  [a-z0-9-] charset the publish route enforces. Falls back to `fallback`
 *  (e.g. the company name) when the URL is empty. */
export function deriveSubdomainLabel(url: string | null | undefined, fallback = ""): string {
  let s = (url ?? "").trim().toLowerCase();
  if (!s) s = (fallback ?? "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");           // protocol
  s = s.replace(/^www\./, "");                 // leading www.
  s = s.split(/[/?#]/)[0] ?? s;                // host only
  s = s.split(".")[0] ?? s;                    // label before first dot
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents
  s = s.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  return s;
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
