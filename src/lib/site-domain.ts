/**
 * Single source of truth for the wildcard domain that serves client sites.
 *
 * Every client-facing host is a subdomain of it:
 *   {label}.{SITE_DOMAIN}  → published site   (middleware → /site/{label})
 *   {uuid}.{SITE_DOMAIN}   → draft/template preview (middleware → /preview/{uuid})
 *   app.{SITE_DOMAIN}      → the CRM app itself
 *
 * Historically two env vars named the same domain — NEXT_PUBLIC_APP_DOMAIN (read
 * by the middleware) and NEXT_PUBLIC_SITE_DOMAIN (read by the code that BUILDS
 * the URLs) — plus five files that hardcoded it. As long as both were unset the
 * shared fallback hid the split; setting only one of them silently broke
 * subdomain routing (links pointing at a host the middleware refuses to parse).
 * Read this module instead of process.env so producer and consumer can't drift.
 *
 * NOTE: the process.env lookups must stay written out literally — Next.js inlines
 * NEXT_PUBLIC_* by textual substitution at build time, so a computed key would
 * resolve to undefined in the browser bundle.
 */

export const DEFAULT_SITE_DOMAIN = "samadigitalstudio.fr";

/** Subdomains that map to the CRM app and are never treated as client sites. */
export const CRM_SUBDOMAINS = new Set(["app", "www", "admin", "crm", "api"]);

/**
 * Sous-domaines publics servis par l'app, hors CRM : `rapport.{SITE_DOMAIN}` →
 * `/rapport`.
 *
 * Pourquoi un sous-domaine plutôt qu'un chemin sur `app.` : le wildcard
 * `*.{SITE_DOMAIN}` est déjà branché sur Vercel (cf. `docs/site-builder-v2.md`),
 * donc zéro travail DNS ; et « rapport.… » se lit par un prospect, contrairement
 * à « app.… », qui a l'air d'un outil interne.
 */
export const PUBLIC_SUBDOMAINS = new Map<string, string>([["rapport", "/rapport"]]);

/**
 * Labels qu'un site client ne doit JAMAIS pouvoir s'approprier.
 *
 * `derive-subdomain.ts` n'avait aucune liste de réservation, et le `taken` des
 * routes de déploiement ne contient que les sous-domaines déjà attribués. Un
 * client dont le site s'appelle « rapport.fr » — ou « app.fr » — recevrait donc
 * le label `rapport` ou `app` et prendrait l'hôte à l'application. Le défaut
 * existait déjà pour `app` avant ce module ; il est corrigé pour les deux.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  ...CRM_SUBDOMAINS,
  ...PUBLIC_SUBDOMAINS.keys(),
]);

/**
 * Reduce a configured value to the bare apex domain: tolerate a protocol, a
 * port, a trailing path or dot, and an `app.` / `www.` host label (a natural
 * thing to paste in, and the exact value that used to break `extractSubdomain`).
 * Returns null for an empty/blank value so the caller can fall through.
 */
export function normalizeSiteDomain(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const domain = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "") // protocol
    .split("/")[0] // path
    .split(":")[0] // port
    .replace(/^\.+|\.+$/g, "") // stray dots
    .replace(/^(?:app|www)\./, ""); // CRM host label
  return domain || null;
}

/** The apex domain every client subdomain hangs off. */
export const SITE_DOMAIN =
  normalizeSiteDomain(process.env.NEXT_PUBLIC_SITE_DOMAIN) ??
  normalizeSiteDomain(process.env.NEXT_PUBLIC_APP_DOMAIN) ??
  DEFAULT_SITE_DOMAIN;

/**
 * The client-site subdomain carried by `hostname`, or null when this host is not
 * one: the apex itself, localhost, a raw IP, or a custom domain (those are
 * resolved by `published_domain` lookup, not by subdomain).
 *
 * CRM subdomains (`app`, `www`, …) ARE returned — callers filter them through
 * CRM_SUBDOMAINS, which is what tells "route to the CRM" apart from "unknown
 * host" at the call site.
 */
export function extractSubdomain(hostname: string, siteDomain: string = SITE_DOMAIN): string | null {
  const host = hostname.split(":")[0].toLowerCase().replace(/\.+$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;

  // Match on the dot-prefixed suffix: a bare endsWith() would also accept
  // "notsamadigitalstudio.fr" and hand back a bogus subdomain.
  const suffix = `.${siteDomain}`;
  if (!host.endsWith(suffix)) return null;

  return host.slice(0, -suffix.length) || null;
}
