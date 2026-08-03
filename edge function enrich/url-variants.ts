// =====================================================================
// Variantes d'URL — ce qu'on tente avant de déclarer un site injoignable
// =====================================================================
// Les URLs stockées viennent de Google Places, d'un import ou d'une saisie : le
// schéma et le sous-domaine `www` y sont souvent faux. Un site qui répond sur
// `http://exemple.fr` était déclaré inaccessible parce qu'on n'avait essayé que
// `https://www.exemple.fr` — l'entreprise partait alors dans le pipeline « sans
// site web » alors que son site existe.
//
// Les quatre combinaisons (www/apex × https/http) coûtent quelques secondes et
// suppriment ce faux négatif. On les ordonne du plus probable au moins probable
// pour que le cas normal reste résolu au premier essai.
//
// Module PUR (aucun global Deno, aucune I/O) : testable depuis la suite Jest du
// CRM, contrairement à `scraper.ts`.

/** Normalise « exemple.fr/x » → URL absolue (ajoute https:// si absent). */
export function toAbsoluteUrl(raw: string | null | undefined): URL | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(withScheme);
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

/**
 * Deux URLs désignent-elles la même origine ? Sert à ne réécrire la fiche que
 * lorsque le site répond réellement ailleurs, et non à chaque enrichissement.
 */
export function sameOrigin(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = originOf(a);
  const right = originOf(b);
  return left != null && right != null && left === right;
}

export interface SiteCandidates {
  /** Origine de l'URL telle qu'elle est stockée — le point de départ. */
  origin: string;
  /** URLs à tenter pour la home, de la plus probable à la moins probable. */
  candidates: string[];
}

/**
 * Liste ordonnée d'URLs à tenter pour atteindre la home.
 *
 * L'ordre :
 *   1. l'URL d'origine complète, chemin compris — certains sites ne rendent du
 *      contenu que sur `/accueil` ;
 *   2. son origine telle quelle ;
 *   3. l'autre schéma sur le même hôte ;
 *   4. l'hôte basculé (www ↔ apex), dans les deux schémas.
 */
export function buildHomeCandidates(rawUrl: string | null | undefined): SiteCandidates | null {
  const url = toAbsoluteUrl(rawUrl);
  if (!url) return null;

  const candidates: string[] = [];
  const push = (value: string) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  const host = url.host;
  const otherHost = toggleWww(host);
  const scheme = url.protocol === "http:" ? "http" : "https";
  const otherScheme = scheme === "https" ? "http" : "https";

  // 1. Chemin d'origine, quand il en porte un.
  const path = url.pathname.replace(/\/+$/, "");
  if (path && path !== "") push(`${scheme}://${host}${path}`);
  // 2. Origine telle quelle.
  push(`${scheme}://${host}`);
  // 3. Même hôte, autre schéma.
  push(`${otherScheme}://${host}`);
  // 4. Hôte basculé, les deux schémas.
  push(`${scheme}://${otherHost}`);
  push(`${otherScheme}://${otherHost}`);

  return { origin: url.origin, candidates };
}
