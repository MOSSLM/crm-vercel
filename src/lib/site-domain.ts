/**
 * Single source of truth for the wildcard domain that serves client sites.
 *
 * Every client-facing host is a subdomain of it:
 *   {label}.{SITE_DOMAIN}  → published site   (middleware → /site/{label})
 *   {uuid}.{SITE_DOMAIN}   → draft/template preview (middleware → /preview/{uuid})
 *   app.{SITE_DOMAIN}      → the CRM app itself
 *   {domaine-client}       → published site   (middleware → /site/{host})
 *
 * La quatrième forme n'a PAS son propre arbre de routes : le segment
 * `/site/[subdomain]` porte soit un label, soit un hôte, et les deux se
 * distinguent par la présence d'un point — un label est slugifié `[a-z0-9-]` et
 * n'en contient jamais. `deciderDestination` (bas de fichier) et
 * `resolveSite` (site-resolver.ts) DOIVENT appliquer la même règle : le jour où
 * l'une discrimine sur la forme et l'autre sur autre chose, tous les domaines
 * clients tombent en 404.
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

import { isPreviewSubdomain } from "@/lib/site-builder/preview-url";

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
 * Suffixes d'hôtes d'infrastructure : ils servent l'app, mais ne sont ni l'apex
 * ni un site client.
 *
 * `crm-vercel.vercel.app` est un hôte de PRODUCTION réellement appelé (trois
 * migrations pg_cron tapent dessus), et c'est aussi l'accès de secours quand le
 * DNS de SITE_DOMAIN casse. Les URLs d'aperçu par PR
 * (`crm-vercel-git-<branche>-<team>.vercel.app`) en dépendent également. Sans
 * cette sortie, la branche « hôte inconnu » les réécrirait toutes vers un site
 * client inexistant et rendrait le CRM injoignable hors DNS.
 */
const INFRA_HOST_SUFFIXES = [".vercel.app"] as const;

/** Chemins qui échappent à la garde « contient un point = statique ». */
const CHEMINS_SEO = new Set(["/robots.txt", "/sitemap.xml"]);

/**
 * Extensions qui désignent une PAGE d'un ancien site, jamais un fichier de chez
 * nous : `.html`, `.php`, `.aspx`…
 *
 * Elles échappent elles aussi à la garde « contient un point = statique », et
 * c'est ce qui rend un plan de redirection atteignable. Sans cette sortie, les
 * URLs les plus précieuses de l'ancien site — celles que Google connaît, avec
 * dix ans d'ancienneté — étaient traitées comme des fichiers statiques : le
 * middleware ne les réécrivait pas vers le site, elles tombaient sur l'arbre du
 * CRM et rendaient son 404. Aucune redirection, où qu'elle soit posée, ne
 * pouvait les rattraper.
 *
 * Ne change RIEN pour les hôtes du CRM et de l'infrastructure : ils sortent
 * plus bas par leurs propres branches. Seuls les hôtes de site sont concernés,
 * et aucun ne sert de fichier portant ces extensions — le contenu est rendu par
 * Next, les médias sont sur le CDN Supabase.
 */
const EXTENSIONS_PAGE_HERITEE = /\.(?:html?|php\d?|phtml|aspx?|jsp|jspx|cfm|shtml)$/i;

/**
 * L'hôte, réduit à sa forme comparable : minuscules, sans port, sans point
 * racine final.
 *
 * Existe parce que le middleware ne faisait que `host.split(":")[0]` et que la
 * normalisation vraie vivait À L'INTÉRIEUR d'`extractSubdomain`. Tant que le
 * middleware ne faisait que passer l'hôte à cette fonction, l'écart était
 * invisible ; dès qu'il utilise l'hôte lui-même (comme segment de chemin, ou
 * pour le comparer à SITE_DOMAIN), les deux trous s'ouvrent : `EXEMPLE.FR` ne
 * matche plus la valeur stockée en minuscules, et `samadigitalstudio.fr.`
 * (forme pleinement qualifiée, légale, émise par certains clients) n'est plus
 * égal à SITE_DOMAIN — il échapperait donc à la garde « ni l'apex ».
 */
export function normalizeHost(raw: string | null | undefined): string {
  const host = (raw ?? "").trim().toLowerCase();
  if (!host) return "";
  // IPv6 littéral (`[::1]:3000`) : un split(":") naïf rendrait "[".
  if (host.startsWith("[")) {
    const fin = host.indexOf("]");
    return fin === -1 ? host : host.slice(0, fin + 1);
  }
  return host.split(":")[0].replace(/\.+$/, "");
}

/**
 * Hôtes qui servent l'app sans être un site : dev local, IP nue, plateforme.
 *
 * Tout ce qui est ici doit continuer de tomber sur l'arbre du CRM, jamais sur
 * la réécriture « domaine client ».
 */
export function isInfrastructureHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (host.startsWith("[")) return true; // IPv6
  return INFRA_HOST_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s));
}

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
 * one: the apex itself, localhost, a raw IP, or a custom domain.
 *
 * Renvoyer `null` sur un domaine client est un COMPORTEMENT VOULU dont dépend
 * tout le routage : c'est ce qui permet à `deciderDestination` de distinguer
 * « sous-domaine de chez nous » de « domaine propre du client ». Le test
 * correspondant (`__tests__/site-domain.test.ts`) est un test de non-régression,
 * pas un vestige.
 *
 * CRM subdomains (`app`, `www`, …) ARE returned — callers filter them through
 * CRM_SUBDOMAINS, which is what tells "route to the CRM" apart from "unknown
 * host" at the call site.
 */
export function extractSubdomain(hostname: string, siteDomain: string = SITE_DOMAIN): string | null {
  const host = normalizeHost(hostname);
  if (!host || host === "localhost" || host.endsWith(".localhost")) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;

  // Match on the dot-prefixed suffix: a bare endsWith() would also accept
  // "notsamadigitalstudio.fr" and hand back a bogus subdomain.
  const suffix = `.${siteDomain}`;
  if (!host.endsWith(suffix)) return null;

  return host.slice(0, -suffix.length) || null;
}

/**
 * Où va cette requête — la décision de routage, en fonction pure.
 *
 * Elle vit ici et pas dans `src/middleware.ts` pour une raison de test : aucun
 * des tests du dépôt n'importe `next/server`, donc `NextRequest`/`NextResponse`
 * n'ont jamais été chargés sous ce transform ts-jest/CJS. Un test de middleware
 * serait un pari d'infrastructure ; une fonction pure se teste avec la table
 * hôte × chemin qu'il faut pour figer les exclusions, dans le fichier qui a déjà
 * tout le vocabulaire.
 *
 * LA CONTRAINTE À CONNAÎTRE : le middleware tourne sur l'edge runtime et
 * s'exécute sur CHAQUE requête de CHAQUE hôte — y compris les hôtes qui ne sont
 * pas les nôtres. Il n'a donc pas le droit de consulter la base. La réécriture
 * d'un domaine client est OPTIMISTE et sans état : on réécrit à l'aveugle, et
 * c'est la route qui tranche en résolvant `published_domain`. Corollaire assumé :
 * un hôte inconnu pointé sur nous consomme une invocation pour finir en 404.
 */
export type Destination =
  /** Laisser passer : le CRM, l'API, les statiques, l'infrastructure. */
  | { kind: "next" }
  /** Sous-domaine public servi par l'app (`rapport.` → `/rapport`). */
  | { kind: "public"; path: string }
  /** Aperçu d'un brouillon, sur un sous-domaine en forme d'UUID. */
  | { kind: "preview"; segment: string }
  /** Site publié. `segment` porte un LABEL (jamais de point) ou un HÔTE. */
  | { kind: "site"; segment: string }
  /** Redirection absolue (le CRM servi sous la marque d'un client). */
  | { kind: "redirect"; to: string };

export function deciderDestination(
  rawHost: string | null | undefined,
  pathname: string,
  siteDomain: string = SITE_DOMAIN,
): Destination {
  // `/robots.txt` et `/sitemap.xml` doivent être réécrits par tenant, alors que
  // TOUT chemin contenant un point est traité comme un statique et laissé
  // passer. Sans cette exception, un sitemap par tenant est inatteignable par
  // construction — et le second verrou est le matcher, qui les exclut lui aussi.
  const estSeo = CHEMINS_SEO.has(pathname);
  // Une page héritée (« /nos-services.html ») doit atteindre la route du site
  // pour que le plan de redirection puisse la rattraper — voir la constante.
  const estPageHeritee = EXTENSIONS_PAGE_HERITEE.test(pathname);
  // Chemins servis à l'identique quel que soit l'hôte. `/api` reste ouvert :
  // les formulaires de contact des sites publiés en dépendent, et la carte
  // OpenGraph pose `og:image` sur `{origine}/api/og/...`.
  //
  // `/desabonnement` s'y ajoute, et pour une raison qui n'a rien à voir avec
  // les deux autres : le lien de désinscription part dans le CORPS des emails
  // froids, donc il doit porter le domaine d'ENVOI — un consommable qu'on
  // remplace — et surtout PAS `app.{siteDomain}`, qui porte toutes les démos.
  // La Domain Blocklist de Spamhaus est interrogée sur les domaines apparaissant
  // dans le corps, et elle liste le domaine racine AVEC tous ses sous-domaines :
  // mettre le domaine des démos dans chaque email froid l'expose entier. Sans
  // cette ligne, un domaine d'envoi ajouté au projet verrait
  // `/desabonnement/...` réécrit en `/site/{domaine}` et rendrait un 404 — un
  // lien de désinscription mort, ce que la CNIL relève comme motif fréquent de
  // réclamation.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/desabonnement") ||
    (pathname.includes(".") && !estSeo && !estPageHeritee)
  ) {
    return { kind: "next" };
  }

  const host = normalizeHost(rawHost);
  if (isInfrastructureHost(host)) return { kind: "next" };

  const subdomain = extractSubdomain(host, siteDomain);

  // Testé AVANT le cas « site client », sinon le rapport serait réécrit vers
  // /site/rapport et rendrait un 404 — c'est le piège documenté sur la route OG.
  const publicPath = subdomain ? PUBLIC_SUBDOMAINS.get(subdomain) : undefined;
  if (publicPath) return { kind: "public", path: publicPath };

  // L'apex nu ne finit pas par `.{siteDomain}` : extractSubdomain rend null pour
  // lui comme pour un domaine client. Il faut donc le nommer explicitement,
  // sans quoi la vitrine de l'agence partirait en /site/samadigitalstudio.fr.
  if (host === siteDomain) return { kind: "next" };
  if (subdomain && CRM_SUBDOMAINS.has(subdomain)) return { kind: "next" };

  // À partir d'ici l'hôte est un hôte de SITE : sous-domaine client ou domaine
  // propre. Le portail de gestion n'a rien à y faire — il s'y affichait jusqu'ici
  // sous la marque du client. Redirection plutôt que 404 : un lien de portail
  // déjà partagé continue de fonctionner.
  if (pathname.startsWith("/portail")) {
    return { kind: "redirect", to: `https://app.${siteDomain}${pathname}` };
  }

  if (subdomain) {
    // L'aperçu de brouillon n'a pas de route SEO — `/preview/{uuid}/robots.txt`
    // tomberait dans son attrape-tout et rendrait du HTML sous un content-type
    // de texte. On le laisse au robots.txt racine, qui refuse tout hôte qui
    // n'est pas celui de l'agence.
    if (isPreviewSubdomain(subdomain)) {
      return estSeo ? { kind: "next" } : { kind: "preview", segment: subdomain };
    }
    return { kind: "site", segment: subdomain };
  }

  return { kind: "site", segment: host };
}
