import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { canonicalizeDomain } from "@/lib/url-canonical";
import { isPlausibleDomain } from "@/lib/archive/reasons";
import { SITE_DOMAIN, isInfrastructureHost, normalizeHost } from "@/lib/site-domain";
import { ReachError, assertFinalHost, reachPage } from "@/lib/http/reach-page";
import {
  apparier,
  chemsDepuisSitemap,
  liensInternes,
  sitemapsDepuisIndex,
  sitemapsDepuisRobots,
} from "@/lib/site-builder/plan-redirections";
import type { SitemapPage } from "@/types";

/**
 * Proposer un plan de redirection en lisant l'ancien site.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE DE CALENDRIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette route DOIT être appelée AVANT la bascule du DNS. Une fois le domaine
 * pointé chez nous, `exemple.fr/sitemap.xml` rend NOTRE sitemap : le plan se
 * construirait sur les URLs du nouveau site, c'est-à-dire sur rien. C'est
 * silencieux et parfaitement crédible — la réponse est un vrai sitemap, avec de
 * vraies URLs. D'où le garde-fou plus bas : si le domaine interrogé est déjà
 * rattaché à un site de chez nous, on refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS SOURCES, DANS CET ORDRE
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. le sitemap annoncé par robots.txt — le plus fiable, c'est celui que
 *      Google lit ;
 *   2. les emplacements conventionnels (`/sitemap.xml`, `/wp-sitemap.xml`…) ;
 *   3. à défaut, les liens de la page d'accueil. Incomplet par construction, et
 *      annoncé comme tel : un vieux site sans sitemap a souvent des pages
 *      qu'aucun lien ne pointe plus, et seule la Search Console du client les
 *      connaît. La réponse le dit pour que l'opérateur aille les chercher.
 *
 * On ne CHERCHE que : rien n'est écrit. L'enregistrement est un second geste,
 * sur `PUT /redirections`, après relecture — même séparation que partout ici.
 */
/**
 * ADMIN SEULEMENT — et c'est une exception assumée dans cet arbre.
 *
 * Les 21 autres routes de `site-builder/[siteId]` sont en `withAuth({})`, donc
 * ouvertes à TOUT compte authentifié. Le garde-fou est côté interface
 * (`AppLayout` renvoie un freelance vers /espace-agent et un client vers
 * /espace-client), ce qui ne protège rien d'un appel direct avec un jeton
 * valide — et il existe aujourd'hui 2 comptes freelance et 1 compte client.
 *
 * On ne suit pas cette convention ici parce que ces routes-ci ne portent pas du
 * contenu : elles portent le ROUTAGE et le DNS. Détourner le domaine d'un
 * client, ou poser une redirection vers un site tiers, se répare beaucoup moins
 * vite qu'un texte de section. Aucune interface non-admin ne les appelle.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { siteId: string };

/** Emplacements conventionnels, dans l'ordre de fréquence réelle. */
const SITEMAPS_CONVENTIONNELS = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml", "/sitemap-index.xml"];

const MAX_SITEMAPS = 6;
const MAX_URLS = 1500;

async function lire(url: string): Promise<string | null> {
  try {
    const cible = new URL(url);
    const res = await reachPage(cible, { timeoutMs: 12_000 });
    // `reachPage` valide l'hôte de DÉPART (garde SSRF) puis suit les
    // redirections. Sans cette seconde validation, un hôte public qui répond
    // 302 vers 169.254.169.254 ou vers localhost nous fait lire le réseau
    // interne de la plateforme et rendre le corps à l'appelant. Les deux autres
    // lecteurs du dépôt (fetch-page-html, audit-site/collect) font cet appel ;
    // celui-ci l'avait oublié.
    await assertFinalHost(res.url || cible.href, cible.hostname);
    if (!res.ok) return null;
    const texte = await res.text();
    return texte.length > 4_000_000 ? texte.slice(0, 4_000_000) : texte;
  } catch (e) {
    if (e instanceof ReachError) return null;
    return null;
  }
}

export const POST = withAuth<undefined, Params>({ role: "admin" }, async ({ req, params }) => {
  const body = (await req.json().catch(() => ({}))) as { domaineAncien?: string };
  const saisie = (body.domaineAncien ?? "").trim();
  if (!saisie) return jsonError("Indique l'adresse de l'ancien site.", 400);

  const domaine = canonicalizeDomain(saisie);
  if (!isPlausibleDomain(domaine)) return jsonError(`« ${domaine} » n'a pas la forme d'un domaine.`, 400);
  const hote = normalizeHost(domaine);
  if (isInfrastructureHost(hote) || hote === SITE_DOMAIN || hote.endsWith(`.${SITE_DOMAIN}`)) {
    return jsonError("Ce n'est pas l'adresse d'un ancien site.", 400);
  }

  const supabase = getServiceClient();

  // Le domaine est-il DÉJÀ chez nous ? Alors son sitemap est le nôtre, et le
  // plan qu'on en tirerait serait vide de sens tout en ayant l'air correct.
  const { data: deja } = await supabase
    .from("sites")
    .select("id")
    .eq("published_domain", hote)
    .maybeSingle();
  if (deja) {
    return jsonError(
      `« ${hote} » est déjà rattaché à un site de chez nous : son sitemap est le nôtre. ` +
        `Le plan se construit AVANT la bascule du DNS — sinon il faut partir de la Search Console du client.`,
      409,
    );
  }

  // Les pages du nouveau site : l'instantané publié s'il existe, le brouillon sinon.
  const { data: site, error } = await supabase
    .from("sites")
    .select("sitemap, published_sitemap")
    .eq("id", params.siteId)
    .single();
  if (error) return jsonError(error.message, error.code === "PGRST116" ? 404 : 500);
  const pages = (((site as { published_sitemap?: SitemapPage[] | null; sitemap?: SitemapPage[] | null }).published_sitemap ??
    (site as { sitemap?: SitemapPage[] | null }).sitemap) ?? []) as SitemapPage[];
  if (pages.length === 0) return jsonError("Ce site n'a pas encore de plan de pages.", 400);

  const base = `https://${hote}`;
  let source: "robots" | "sitemap" | "liens" | null = null;
  const chemins = new Set<string>();

  const avaler = (xml: string) => {
    for (const c of chemsDepuisSitemap(xml, hote)) {
      if (chemins.size >= MAX_URLS) break;
      chemins.add(c);
    }
  };

  // 1. robots.txt, puis 2. les emplacements conventionnels.
  const robots = await lire(`${base}/robots.txt`);
  const candidats = [
    ...(robots ? sitemapsDepuisRobots(robots) : []),
    ...SITEMAPS_CONVENTIONNELS.map((c) => `${base}${c}`),
  ];

  const vus = new Set<string>();
  const file = [...new Set(candidats)];
  while (file.length > 0 && vus.size < MAX_SITEMAPS && chemins.size < MAX_URLS) {
    const url = file.shift() as string;
    if (vus.has(url)) continue;
    vus.add(url);
    const xml = await lire(url);
    if (!xml || !/<(?:urlset|sitemapindex)/i.test(xml)) continue;
    source ??= robots && sitemapsDepuisRobots(robots).includes(url) ? "robots" : "sitemap";
    // Un index ne porte pas d'URL de page : il renvoie vers d'autres sitemaps.
    const enfants = sitemapsDepuisIndex(xml);
    if (enfants.length > 0) file.push(...enfants);
    else avaler(xml);
  }

  // 3. Repli : les liens de l'accueil.
  if (chemins.size === 0) {
    const html = await lire(base);
    if (!html) {
      return jsonError(
        `Impossible de joindre ${hote}. Vérifie l'adresse, ou construis le plan depuis la Search Console du client.`,
        502,
      );
    }
    source = "liens";
    for (const c of liensInternes(html, base)) chemins.add(c);
  }

  const { propositions, orphelins } = apparier([...chemins], pages);

  return json({
    domaineAncien: hote,
    source,
    /** Ce qu'on a réellement lu, pour que l'opérateur juge de la couverture. */
    urlsLues: chemins.size,
    propositions,
    orphelins,
    incomplet: source === "liens",
  });
});
