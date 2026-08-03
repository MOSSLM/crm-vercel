/**
 * Variantes d'URL — ce qu'on tente avant de déclarer une adresse injoignable.
 *
 * Les URLs stockées ou saisies viennent de Google Places, d'un import ou d'un
 * copier-coller : le schéma et le sous-domaine `www` y sont souvent faux. Un
 * site qui répond sur `http://exemple.fr` était déclaré injoignable parce qu'on
 * n'avait essayé que `https://www.exemple.fr`.
 *
 * Les quatre combinaisons (www/apex × https/http) coûtent quelques secondes et
 * suppriment ce faux négatif, en gardant le cas normal résolu au premier essai.
 *
 * Jumeau de `edge function enrich/url-variants.ts` : l'edge function tourne sous
 * Deno et se déploie à part, elle ne peut pas importer `src/`. Toute correction
 * de règle doit donc être reportée des deux côtés.
 */

/** Normalise « exemple.fr/x » → URL absolue (ajoute https:// si absent). */
export function toAbsoluteUrl(raw: string | null | undefined): URL | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** `www.exemple.fr` ↔ `exemple.fr`. */
export function toggleWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : `www.${host}`;
}

/** Origine (`https://exemple.fr`) d'une URL, ou `null` si elle est illisible. */
export function originOf(raw: string | null | undefined): string | null {
  return toAbsoluteUrl(raw)?.origin ?? null;
}

/** Deux URLs désignent-elles la même origine ? */
export function sameOrigin(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = originOf(a);
  const right = originOf(b);
  return left != null && right != null && left === right;
}

/**
 * Liste ordonnée d'URLs à tenter pour atteindre une page.
 *
 * L'ordre : l'URL demandée telle quelle (chemin compris), puis l'autre schéma
 * sur le même hôte, puis l'hôte basculé (www ↔ apex) dans les deux schémas. Le
 * chemin est conservé sur chaque variante : `/contact` reste `/contact`.
 */
export function buildUrlCandidates(rawUrl: string | null | undefined): string[] {
  const url = toAbsoluteUrl(rawUrl);
  if (!url) return [];

  const candidates: string[] = [];
  const push = (value: string) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  const suffix = `${url.pathname}${url.search}`.replace(/\/+$/, "") || "";
  const host = url.host;
  const otherHost = toggleWww(host);
  const scheme = url.protocol === "http:" ? "http" : "https";
  const otherScheme = scheme === "https" ? "http" : "https";

  push(`${scheme}://${host}${suffix}`);
  push(`${otherScheme}://${host}${suffix}`);
  push(`${scheme}://${otherHost}${suffix}`);
  push(`${otherScheme}://${otherHost}${suffix}`);

  return candidates;
}
