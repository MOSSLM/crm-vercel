// =====================================================================
// Choix des pages à scraper, et nettoyage de ce qu'elles ont en commun
// =====================================================================
// Le scraper devinait sept chemins fixes (`/contact`, `/mentions-legales`…). Un
// site qui nomme sa page `/nous-joindre`, `/qui-sommes-nous.php` ou
// `/fr/contactez-nous` n'était donc jamais lu — or ce sont précisément ces pages
// qui portent l'email et le SIRET, les deux données que l'extraction cherche le
// plus. On lit maintenant les liens de la home, déjà en main, et on choisit par
// INTENTION plutôt que par URL.
//
// Second problème, invisible mais coûteux : menu et pied de page se répètent sur
// chaque page scrapée. Concaténés, ils occupaient une large part des 30 000
// caractères envoyés au LLM — huit fois la même navigation, au détriment du
// contenu réel. `stripSharedBoilerplate` les retire.
//
// Module PUR (aucun global Deno, aucune I/O) : testable depuis la suite Jest du
// CRM, comme `url-variants.ts` et `geo.ts`.
// =====================================================================

/** Mots-clés d'intention, du plus utile au moins, avec leur poids. */
const INTENT_PATTERNS: Array<{ score: number; re: RegExp }> = [
  // L'email et le formulaire vivent là.
  { score: 100, re: /(^|[/_-])(contact|contactez|nous-contacter|nous-joindre|joindre)([/_.-]|$)/ },
  // Le SIRET, la raison sociale, parfois l'email de direction.
  { score: 90, re: /(^|[/_-])(mentions?-?legales?|mentions|legal|impressum|cgv|cgu)([/_.-]|$)/ },
  // Années d'expérience, effectif, histoire.
  { score: 80, re: /(^|[/_-])(a-propos|apropos|about|qui-sommes-nous|notre-entreprise|entreprise|societe|histoire)([/_.-]|$)/ },
  // La liste des services alimente les service tags.
  { score: 70, re: /(^|[/_-])(services?|prestations?|nos-services|savoir-faire|activites?|metiers?)([/_.-]|$)/ },
  // Chantiers et qualifications (RGE) s'y trouvent souvent.
  { score: 50, re: /(^|[/_-])(realisations?|references?|chantiers?|nos-realisations|galerie|certifications?|qualifications?)([/_.-]|$)/ },
  { score: 30, re: /(^|[/_-])(tarifs?|devis|prix)([/_.-]|$)/ },
];

/**
 * Chemins qu'on ne veut jamais scraper : ils coûtent une requête et n'apportent
 * rien à l'extraction, quand ils ne la polluent pas (un article de blog parle de
 * tout autre chose que l'entreprise).
 */
const EXCLUDED = /(^|[/_-])(blog|actualites?|news|article|panier|cart|compte|account|login|connexion|inscription|wp-admin|wp-login|feed|rss|sitemap|recrutement|emploi|faq|plan-du-site|politique-de-confidentialite|cookies?)([/_.-]|$)/;

/** Extensions de fichier qui ne sont pas des pages. */
const NON_PAGE_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|css|js|json|xml|zip|docx?|xlsx?|mp4|webm|woff2?)$/;

/** Normalise un chemin pour comparaison : minuscules, sans slash final. */
function normalizePath(pathname: string): string {
  const p = pathname.toLowerCase().replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/**
 * Liens internes d'un document HTML, en URLs absolues dédoublonnées.
 *
 * Volontairement tolérant : on lit les `href` au motif plutôt qu'en parsant le
 * document, parce que le HTML des sites de TPE est souvent mal formé et qu'un
 * parseur strict y rendrait moins que ce vrac. Les liens externes, les ancres,
 * les `mailto:`/`tel:` et les fichiers sont écartés.
 */
export function extractInternalLinks(html: string, origin: string): string[] {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];

  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("#")) continue;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) continue;

    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    // Même site seulement : on compare l'hôte sans `www.`, parce qu'un site
    // mélange fréquemment les deux formes dans ses propres liens.
    const strip = (h: string) => h.replace(/^www\./i, "").toLowerCase();
    if (strip(url.hostname) !== strip(base.hostname)) continue;

    const path = normalizePath(url.pathname);
    if (path === "/") continue; // la home est déjà scrapée
    if (NON_PAGE_EXT.test(path)) continue;

    // Dédoublonnage sur le chemin : query et fragment ne changent pas la page
    // pour ce qui nous intéresse.
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(`${base.origin}${url.pathname.replace(/\/+$/, "") || "/"}`);
  }

  return out;
}

/** Score d'intention d'un chemin. `0` = aucun intérêt identifié. */
export function scorePath(pathname: string): number {
  const path = normalizePath(pathname);
  if (EXCLUDED.test(path)) return 0;
  for (const { score, re } of INTENT_PATTERNS) {
    if (re.test(path)) {
      // Un chemin court est plus probablement la vraie page que sa déclinaison
      // (`/contact` avant `/services/climatisation/contact-technicien`).
      const depth = path.split("/").filter(Boolean).length;
      return score - Math.min(depth - 1, 3) * 5;
    }
  }
  return 0;
}

/**
 * Classe des URLs par intérêt pour l'extraction, les sans-intérêt écartées.
 *
 * À score égal, l'ordre d'apparition dans la page est conservé : il reflète en
 * général la navigation principale du site.
 */
export function rankCandidatePages(links: string[], limit = 6): string[] {
  const scored: Array<{ url: string; score: number; index: number }> = [];
  links.forEach((url, index) => {
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      return;
    }
    const score = scorePath(path);
    if (score > 0) scored.push({ url, score, index });
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((s) => s.url);
}

/** Une page scrapée, réduite à ce dont la déduplication a besoin. */
export interface PageContent {
  path: string;
  markdown: string;
}

/**
 * Retire de chaque page les lignes qu'elles ont presque toutes en commun.
 *
 * Menu, pied de page, bandeau cookies : répétés à l'identique sur huit pages, ils
 * remplissaient le budget du prompt sans rien apprendre au modèle. On ne peut pas
 * les repérer par leur position (le markdown de Jina et notre conversion HTML n'ont
 * pas la même structure), mais on peut les repérer par leur RÉPÉTITION.
 *
 * Trois garde-fous, parce qu'un faux positif supprimerait du contenu utile :
 *  - il faut au moins 3 pages, sinon « répété » ne veut rien dire ;
 *  - seules les lignes courtes (< 200 caractères) sont candidates — un paragraphe
 *    identique sur toutes les pages est un vrai contenu, pas de la navigation ;
 *  - une page qui perdrait plus de la moitié de sa substance est rendue intacte,
 *    ce qui protège les sites mono-page dont toutes les « pages » se ressemblent.
 */
export function stripSharedBoilerplate(pages: PageContent[]): PageContent[] {
  if (pages.length < 3) return pages;

  const counts = new Map<string, number>();
  for (const page of pages) {
    // Un `Set` par page : une ligne répétée DANS une page ne compte qu'une fois,
    // sinon un menu listé deux fois sur la même page gonflerait son score.
    const lines = new Set(
      page.markdown.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && l.length < 200),
    );
    for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  const threshold = Math.ceil(pages.length * 0.6);
  const shared = new Set<string>();
  for (const [line, n] of counts) {
    if (n >= threshold) shared.add(line);
  }
  if (shared.size === 0) return pages;

  return pages.map((page) => {
    const kept = page.markdown
      .split("\n")
      .filter((l) => !shared.has(l.trim()))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    // Garde-fou : mieux vaut du bruit que du contenu perdu.
    if (kept.length < page.markdown.length * 0.5) return page;
    return { ...page, markdown: kept };
  });
}

/**
 * Répartit un budget de caractères entre les pages, au lieu de le consommer dans
 * l'ordre.
 *
 * L'ancien découpage remplissait séquentiellement : une home bavarde absorbait les
 * 30 000 caractères et `contact` — la page qui porte l'email — n'arrivait jamais au
 * modèle. Chaque page reçoit maintenant une part garantie, et le reliquat des
 * pages courtes est redistribué à celles qui débordent.
 */
export function allocateBudget(
  pages: PageContent[],
  opts: { total?: number; homeMax?: number; pageMax?: number } = {},
): Map<string, number> {
  const total = opts.total ?? 30000;
  const homeMax = opts.homeMax ?? 12000;
  const pageMax = opts.pageMax ?? 4000;

  const quota = new Map<string, number>();
  for (const p of pages) {
    quota.set(p.path, Math.min(p.markdown.length, p.path === "/" ? homeMax : pageMax));
  }

  // Reliquat : ce que les pages courtes n'utilisent pas revient aux autres.
  let used = 0;
  for (const q of quota.values()) used += q;
  let spare = total - used;

  if (spare > 0) {
    for (const p of pages) {
      if (spare <= 0) break;
      const current = quota.get(p.path) ?? 0;
      const want = p.markdown.length - current;
      if (want <= 0) continue;
      const give = Math.min(want, spare);
      quota.set(p.path, current + give);
      spare -= give;
    }
  } else if (spare < 0) {
    // Budget dépassé : on rabote les plus gros quotas d'abord, la home comprise.
    const order = [...pages].sort(
      (a, b) => (quota.get(b.path) ?? 0) - (quota.get(a.path) ?? 0),
    );
    for (const p of order) {
      if (spare >= 0) break;
      const current = quota.get(p.path) ?? 0;
      // On ne descend jamais sous 500 caractères : une page réduite à rien ne sert
      // à rien, autant lui garder de quoi porter un email.
      const canTake = Math.max(0, current - 500);
      const take = Math.min(canTake, -spare);
      quota.set(p.path, current - take);
      spare += take;
    }
  }

  return quota;
}
