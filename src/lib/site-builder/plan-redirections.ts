/**
 * Fabriquer le plan de redirection à partir de l'ANCIEN site.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PROPOSITION, JAMAIS UNE ÉCRITURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le rapprochement est fait sur des mots : « /nos-services.html » ressemble à
 * « /services », « /qui-sommes-nous » à « /a-propos ». Ça marche pour l'immense
 * majorité des vieux sites d'artisans — et ça se trompe. Une redirection fausse
 * est pire qu'une redirection absente : elle envoie un visiteur, et un moteur,
 * sur une page qui ne répond pas à ce qu'il cherchait, sans laisser de trace.
 *
 * Ce module ne décide donc rien : il propose, avec un score, et l'opérateur
 * relit. C'est la même séparation que partout ici — chercher et écrire sont
 * deux gestes distincts (cf. `src/lib/architecture/bots.ts`).
 *
 * Module PUR : le réseau est au-dessus, dans la route. Ce qui se teste ici,
 * c'est l'extraction et le rapprochement.
 */
import type { SitemapPage } from "@/types";
import { normaliserChemin, type RegleRedirection } from "@/lib/site-builder/redirections";

/** Les `<loc>` d'un sitemap.xml, réduits à leur chemin. */
export function chemsDepuisSitemap(xml: string, hoteAncien?: string): string[] {
  const chemins: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const brut = (m[1] ?? "").trim();
    if (!brut) continue;
    try {
      const url = new URL(brut);
      // Un sitemap peut lister d'autres domaines (agrégateurs, sous-marques) :
      // on ne redirige que ce qui appartient au site qu'on remplace.
      if (hoteAncien && !url.hostname.replace(/^www\./, "").endsWith(hoteAncien.replace(/^www\./, ""))) continue;
      chemins.push(normaliserChemin(url.pathname));
    } catch {
      chemins.push(normaliserChemin(brut));
    }
  }
  return [...new Set(chemins)];
}

/** Les sitemaps référencés par un index (`<sitemapindex>`). */
export function sitemapsDepuisIndex(xml: string): string[] {
  if (!/<sitemapindex/i.test(xml)) return [];
  const urls: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const brut = (m[1] ?? "").trim();
    if (brut) urls.push(brut);
  }
  return [...new Set(urls)];
}

/** Les sitemaps annoncés par un robots.txt. */
export function sitemapsDepuisRobots(txt: string): string[] {
  return (txt.match(/^\s*sitemap:\s*(\S+)\s*$/gim) ?? [])
    .map((l) => l.replace(/^\s*sitemap:\s*/i, "").trim())
    .filter(Boolean);
}

/** Les liens internes d'une page — le repli quand aucun sitemap n'existe. */
export function liensInternes(html: string, base: string): string[] {
  let origine: URL;
  try {
    origine = new URL(base);
  } catch {
    return [];
  }
  const chemins: string[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] ?? "").trim();
    if (!href || href.startsWith("#") || /^(?:mailto|tel|javascript):/i.test(href)) continue;
    try {
      const url = new URL(href, origine);
      if (url.hostname.replace(/^www\./, "") !== origine.hostname.replace(/^www\./, "")) continue;
      // Les fichiers ne se redirigent pas vers des pages.
      if (/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/i.test(url.pathname)) continue;
      chemins.push(normaliserChemin(url.pathname));
    } catch {
      /* href illisible : ignoré */
    }
  }
  return [...new Set(chemins)];
}

/**
 * Les équivalences qu'un rapprochement par mots ne trouve pas tout seul.
 *
 * Liste courte et volontairement bête : ce sont les formulations qui reviennent
 * sur presque tous les sites d'artisans français. Chaque entrée y est parce
 * qu'on l'a vue, pas par symétrie.
 */
const SYNONYMES: Record<string, string[]> = {
  services: ["prestations", "savoir-faire", "metiers", "activites", "nos-services", "ce-que-nous-faisons"],
  "a-propos": ["qui-sommes-nous", "entreprise", "presentation", "notre-histoire", "societe", "about"],
  contact: ["nous-contacter", "coordonnees", "contactez-nous", "devis", "demande-de-devis"],
  realisations: ["references", "chantiers", "galerie", "portfolio", "nos-realisations", "travaux", "projets"],
  avis: ["temoignages", "clients", "recommandations"],
  blog: ["actualites", "actus", "news", "articles"],
  tarifs: ["prix", "tarification", "nos-tarifs"],
  urgence: ["depannage", "intervention", "sos"],
};

const MOTS_VIDES = new Set([
  "le", "la", "les", "de", "des", "du", "un", "une", "et", "en", "nos", "notre", "vos", "votre",
  "page", "index", "home", "accueil", "fr", "www", "site", "html", "php", "htm",
]);

/** Un chemin réduit à ses mots comparables. */
function mots(chemin: string): string[] {
  return normaliserChemin(chemin)
    .replace(/\.(?:html?|php\d?|phtml|aspx?|jsp|cfm|shtml)$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/i)
    .map((m) => m.toLowerCase())
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
}

/** Les mots d'une page cible : son slug ET son titre, qui portent souvent plus. */
function motsDePage(page: SitemapPage): string[] {
  const base = [...mots(page.slug), ...mots(`/${page.title ?? ""}`)];
  const cle = normaliserChemin(page.slug).replace(/^\//, "");
  const synonymes = SYNONYMES[cle] ?? [];
  return [...new Set([...base, ...synonymes.flatMap((s) => mots(`/${s}`))])];
}

export interface Proposition {
  de: string;
  vers: string;
  /** 0 à 1. Au-dessus de 0,5 le rapprochement est solide ; en dessous, à relire. */
  score: number;
  /** Le titre de la page proposée, pour relire sans ouvrir le site. */
  titre?: string;
}

export interface ResultatAppariement {
  propositions: Proposition[];
  /** Les chemins pour lesquels aucune cible ne ressort. À traiter à la main. */
  orphelins: string[];
}

/**
 * Rapproche chaque URL de l'ancien site d'une page du nouveau.
 *
 * L'accueil est traité à part : « / », « /index.html », « /index.php » et
 * « /accueil » désignent toujours la même chose et ne doivent pas dépendre
 * d'une ressemblance de mots.
 */
export function apparier(
  cheminsAnciens: readonly string[],
  pages: readonly SitemapPage[],
  opts: { seuil?: number } = {},
): ResultatAppariement {
  const seuil = opts.seuil ?? 0.34;
  const cibles = pages.map((p) => ({ page: p, slug: normaliserChemin(p.slug), mots: motsDePage(p) }));
  const slugs = new Set(cibles.map((c) => c.slug));

  const propositions: Proposition[] = [];
  const orphelins: string[] = [];

  for (const brut of cheminsAnciens) {
    const chemin = normaliserChemin(brut);

    // L'accueil de l'ancien site : jamais une affaire de ressemblance.
    if (/^\/(?:index\.(?:html?|php\d?|phtml|aspx?)|accueil|home)?$/i.test(chemin)) {
      if (chemin !== "/") propositions.push({ de: chemin, vers: "/", score: 1, titre: "Accueil" });
      continue;
    }

    // Chemin identique de part et d'autre : rien à rediriger.
    if (slugs.has(chemin)) continue;

    const motsAncien = mots(chemin);
    if (motsAncien.length === 0) {
      orphelins.push(chemin);
      continue;
    }

    let meilleur: { cible: (typeof cibles)[number]; score: number } | null = null;
    for (const cible of cibles) {
      if (cible.slug === "/") continue; // l'accueil ne se gagne pas aux mots
      const communs = motsAncien.filter((m) => cible.mots.includes(m)).length;
      if (communs === 0) continue;
      // Rapport de recouvrement, pondéré par la couverture de l'ancien chemin :
      // « /services-chauffage.html » doit préférer « /chauffage » à « /services »
      // quand les deux existent.
      const score = (communs / motsAncien.length) * 0.6 + (communs / cible.mots.length) * 0.4;
      if (!meilleur || score > meilleur.score) meilleur = { cible, score };
    }

    if (!meilleur || meilleur.score < seuil) {
      orphelins.push(chemin);
      continue;
    }
    propositions.push({
      de: chemin,
      vers: meilleur.cible.slug,
      score: Math.round(meilleur.score * 100) / 100,
      titre: meilleur.cible.page.title,
    });
  }

  propositions.sort((a, b) => b.score - a.score || a.de.localeCompare(b.de));
  return { propositions, orphelins: [...new Set(orphelins)].sort() };
}

/** Les propositions retenues, sous la forme attendue par le plan. */
export function versRegles(propositions: readonly Proposition[]): RegleRedirection[] {
  return propositions.map((p) => ({ de: p.de, vers: p.vers }));
}
